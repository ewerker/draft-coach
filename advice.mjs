import {CARDS,buildDatabaseAdvice} from './data/coach-engine.mjs';
export function allowedNames(collection,mode,extended=false) {
  const units=collection.units.units
    .filter(card=>extended||mode==='arena'||collection.units.active_lineup.includes(card.name))
    .map(card=>card.name);
  const spells=extended?collection.spells.spells.map(card=>card.name):collection.spells.active_loadout;
  return new Set([...units,...spells]);
}
export function observeDraftLineup(tracker,result,owned){
  if(tracker.confirmed||result.phase!=='battle_choice'||!result.deckEvidence)return null;
  const reliable=card=>owned.has(card.name)&&card.nameSource==='Kartenbeschriftung'&&!card.poolHint&&
    card.similarity>=.75&&card.captionMargin>=.10&&card.action!=='unknown';
  for(const card of result.offers)if(reliable(card))tracker.seen.add(card.name);
  if(result.offers.length===3&&result.offers.every(reliable)){
    const signature=JSON.stringify(result.offers.map(({position,name,action,quantity})=>[position,name,action,quantity]));
    if(!tracker.windows.has(signature)){
      tracker.windows.add(signature);
      for(const name of new Set(result.offers.map(card=>card.name))){
        tracker.counts.set(name,(tracker.counts.get(name)??0)+1);
      }
    }
  }
  const names=[...tracker.seen];
  return names.length===4&&names.every(name=>tracker.counts.get(name)>=2)?names:null;
}
export function observeOwnCardValues(pending,result,units){
  if(!['deck_choice','battle_choice'].includes(result.phase)||result.specialStep)return units;
  const deck=result.phase==='deck_choice';
  const cards=[...result.offers,...(deck?result.own??[]:[])];
  return units.map(unit=>{
    const offers=cards.filter(card=>card.name===unit.name&&!card.poolHint&&(
      card.nameSource==='Kartenbeschriftung'
        ? card.similarity>=.75&&card.captionMargin>=.10
        : deck&&card.similarity>=.85&&card.margin>=.10
    )&&(deck||card.action==='add'));
    let updated=unit;
    for(const [badge,field] of [['orange','bottom_badge'],['blue','blue_star']]){
      const key=unit.name+' '+field;
      const values=new Set(offers.map(card=>card[badge]).filter(reading=>
        Number.isInteger(reading?.value)&&reading.value>0&&reading.similarity>=.8
      ).map(reading=>reading.value));
      if(!values.size)continue;
      const [value]=values;
      if(values.size!==1||value<=(unit[field]??0)){
        pending.delete(key);
      }else if(pending.get(key)===value){
        updated={...updated,[field]:value};
      }else{
        pending.set(key,value);
      }
    }
    return updated;
  });
}
export function observeChosenReinforcement(counts, offer){
  if(!offer?.name||!Number.isInteger(offer.quantity)||offer.quantity<1)return;
  const previous=counts.get(offer.name)??0;
  if(offer.action==='add')counts.set(offer.name,previous+offer.quantity);
  if(previous&&['multiply','multiply_upgrade'].includes(offer.action))
    counts.set(offer.name,previous*offer.quantity);
}

const deckRanged=new Set(['Merlinor','Kupid','Sniper']);
const deckBacklineAccess=new Set(['Agent B','Assassine','Maulwurf']);

export function suggestLineup(collection){
  const catalog=new Map(CARDS.map(card=>[card.name,card]));
  const role=card=>catalog.get(card.name)?.role;
  const strength=card=>(card.bottom_badge??catalog.get(card.name)?.strength??0)+.2*(card.blue_star??0);
  const select=(stock,slots,limit)=>{
    const ranked=[...stock].sort((a,b)=>strength(b)-strength(a)||a.name.localeCompare(b.name,'de'));
    const chosen=new Map();
    for(const [purpose,matches] of slots){
      const card=ranked.find(card=>!chosen.has(card.name)&&matches(card));
      if(card)chosen.set(card.name,{...card,purpose});
    }
    for(const card of ranked){
      if(chosen.size>=limit)break;
      if(!chosen.has(card.name))chosen.set(card.name,{...card,purpose:'Kartenstärke'});
    }
    return [...chosen.values()].map(({name,bottom_badge,blue_star,purpose})=>({name,bottom_badge,blue_star,purpose}));
  };
  return {
    units:select(collection.units.units,[
      ['Frontlinie',card=>role(card)==='Front'],
      ['Fernkampf',card=>deckRanged.has(card.name)],
      ['Zugriff auf die Hinterreihe',card=>deckBacklineAccess.has(card.name)||card.name==='Kapitän'],
      ['Flächenschaden',card=>role(card)==='Fläche'],
    ],4),
    spells:select(collection.spells.spells,[
      ['Flächenschaden',card=>role(card)==='Fläche'],
      ['Schutz oder Verstärkung',card=>['Schutz','Verstärkung'].includes(role(card))],
      ['Druck auf die Hinterreihe',card=>['Zugriff','Fernkampf'].includes(role(card))],
    ],3),
  };
}

export function recommend(result, mode, collection, db, extended=false, rules=[], includeTests=false) {
  const allowed=allowedNames(collection,mode,extended||[1,2].includes(result.specialStep));
  if(mode==='draft'){
    const owned=new Set(collection.units.units.map(card=>card.name));
    for(const name of result.observedDraftUnits??[])if(owned.has(name))allowed.add(name);
  }
  const enemy=(result.enemy||[]).filter(c=>c.name).map(c=>c.name);
  const strengths=new Map([...collection.units.units,...collection.spells.spells].map(c=>[c.name,c.bottom_badge]));
  const warnings=[];
  const ownDeck=new Set([...(result.ownDeckPicks??[]),...(result.own??[]).map(card=>card.name)]);
  const hasRanged=[...ownDeck].some(name=>deckRanged.has(name));
  const hasBacklineAccess=[...ownDeck].some(name=>deckBacklineAccess.has(name));
  const rearThreat=['Bienenkorb','Schnecke'].find(name=>enemy.includes(name)&&
    (result.enemyAdditions?.[name]>=2||(result.enemy??[]).some(card=>card.name===name&&card.action==='add'&&card.quantity>=2)));
  const evaluated=(result.offers||[]).map((offer,index)=>{
    const reinforcement=reinforcementValue(result,offer);
    const applied=rules.filter(rule=>rule.offer===offer.name&&
      (rule.status==='aktiv'||includeTests&&rule.status==='test')&&
      (rule.mode==='beide'||rule.mode===mode)&&(rule.phase==='alle'||rule.phase===result.phase)&&
      (!rule.action||rule.action===offer.action||rule.action==='upgrade'&&offer.action==='multiply_upgrade')&&
      (!rule.enemy||enemy.includes(rule.enemy)));
    let ruleOnly=!CARDS.some(card=>card.name===offer.name);
    const isChoice=['deck_choice','battle_choice'].includes(result.phase);
    const spellChoice=result.phase==='spell_choice'&&offer.action==='spell';
    const reason = !offer.name ? 'Figur unsicher erkannt' : !allowed.has(offer.name) ? 'Nicht im Pool dieses Modus' : ruleOnly&&!applied.length&&!isChoice ? 'Noch keine Bewertungsregeln für diese Figur' : offer.action!=='add'&&!reinforcement&&!spellChoice ? 'Aktion noch unbekannt' : null;
    if(reason)return {index,name:offer.name,score:null,reason};
    const cards=CARDS.map(c=>({...c,strength:strengths.get(c.name)??c.strength,inSelection:c.name===offer.name,inDeck:c.name===offer.name}));
    let score,why;
    if(enemy.length&&!ruleOnly) {
      const scores=enemy.map(e=>buildDatabaseAdvice({enemyItems:[e],userCards:cards,dbEntries:db,unitScope:'selection',spellScope:'selection'}).reactionRanking.find(r=>r.name===offer.name)).filter(Boolean);
      if(scores.length){
        score=.75*scores.reduce((s,c)=>s+c.score,0)/scores.length+.25*Math.min(...scores.map(c=>c.score));
        why=scores.sort((a,b)=>b.score-a.score)[0].reason;
      }else if(applied.length){
        ruleOnly=true;
      }else if(result.phase!=='battle_choice'&&!spellChoice)return {index,name:offer.name,score:null,reason:'Keine passende Bewertung vorhanden'};
    }
    if(score===undefined){
      const level=offer.orange?.value??strengths.get(offer.name)??0;
      score=enemy.length&&isChoice?74+Math.max(-4,Math.min(6,Math.round((level-8)*1.2))):
        50+Math.min(15,Number(level));
      why=ruleOnly?'Ersatzwertung nach Kartenstufe und sichtbarer Aktion. Für diese Figur fehlen eigene Matchup-Daten.':
        enemy.length?'Eigene Kartenstufe als Ausgangswert. Für diese Karte ist kein passender Konter hinterlegt.':
        'Einfacher Einstieg nach eigener Kartenstärke. Keine gegnerischen Karten sicher erkannt.';
    }
    if(result.phase==='deck_choice'&&!hasRanged){
      if(deckRanged.has(offer.name)){
        score+=hasBacklineAccess?10:18;
        why+=' Fernkampf ergänzt das Deck und kann Ziele aus der Distanz erreichen.';
      }else if(!hasBacklineAccess&&deckBacklineAccess.has(offer.name)){
        score+=10;
        why+=' Direkter Zugriff auf die gegnerische Hinterreihe ergänzt das Deck.';
      }
    }
    if(result.phase==='battle_choice'&&rearThreat&&(deckBacklineAccess.has(offer.name)||offer.name==='Sniper')){
      score+=14;
      why+=` Zugriff auf die Hinterreihe ist wichtiger, weil mehrere Einheiten vom Typ ${rearThreat} beobachtet wurden.`;
    }
    const additions=visibleAdditions(result,offer);
    if(additions){
      score+=additions*2;
      why+=` Angebot: +${offer.quantity} Figuren.`;
    }
    if(reinforcement){
      score+=reinforcement.points;
      why+=' '+reinforcement.reason;
    }
    if(result.phase==='battle_choice'&&enemy.length===1&&enemy[0]==='Schnecke'&&offer.name==='Sniper'){
      score+=32;
      why+=' Sniper priorisiert, weil Schnecke die einzige erkannte Gegnerfigur ist.';
    }
    const delta=Math.max(-25,Math.min(25,applied.reduce((total,rule)=>total+rule.weight,0)));
    return {index,name:offer.name,score:Math.round((score+delta)*10)/10,reason:why,ruleOnly,delta,
      rules:applied.map(({title,reason,weight,status})=>({title,reason,weight,status}))};
  });
  warnings.push('Basiswertung aus der bisherigen App. Mengen, gegnerische Stärken und eigene Synergien sind noch nicht vollständig bewertet.');
  const scored=evaluated.filter(card=>card.score!==null).sort((a,b)=>b.score-a.score);
  const complete=!result.specialStep&&evaluated.length>0&&scored.length===evaluated.length&&!scored.some(card=>card.ruleOnly);
  const pick=preferReinforcement(result,scored,evaluated);
  const fallback=complete?null:trialPick(result,evaluated,strengths);
  return {best:complete?pick:null,provisional:complete?null:pick,fallback,evaluated,warnings,withheld:!complete};
}

function visibleAdditions(result,offer){
  return result.phase==='battle_choice'&&offer.action==='add'?Math.min(offer.quantity??0,12):0;
}

function reinforcementValue(result,offer){
  if(result.phase!=='battle_choice'||!['multiply','upgrade','multiply_upgrade'].includes(offer.action))return null;
  const tracked=result.ownReinforcements?.[offer.name]??0;
  const count=Math.max(tracked,result.own?.filter(card=>card.name===offer.name).length??0)||null;
  const upgrade=offer.action!=='multiply';
  const double=offer.action!=='upgrade';
  const points=(upgrade?(count===null?11:Math.min(count*(count>2?4:2),30)):0)+
    (double?(count===null?14:Math.min(count*3,20)):0);
  const action=upgrade&&double?'Verdopplung mit Aufwertung':upgrade?'Aufwertung':'Verdopplung';
  const scope=tracked&&count===tracked?`mindestens ${tracked} aus beobachteten Wahlen`:count===null?'Bestand unbekannt':`${count} vorhandene Figuren`;
  return {points,reason:`${action} bevorzugt (${scope}).`,
    preferIfClose:count===null||count>2||(double&&count>=2)};
}

function preferReinforcement(result,ranked,evaluated){
  const first=ranked[0];
  if(!first||result.phase!=='battle_choice')return first??null;
  const offer=result.offers[first.index];
  if(offer.action!=='add'||!Number.isInteger(offer.quantity)||offer.quantity>3)return first;
  return ranked.find(candidate=>evaluated[candidate.index].score!==null&&first.score-candidate.score<=4&&
    reinforcementValue(result,result.offers[candidate.index])?.preferIfClose)??first;
}

function trialPick(result,evaluated,strengths){
  if(!['deck_choice','battle_choice','spell_choice'].includes(result.phase))return null;
  const options=result.offers.map((card,index)=>{
    const rated=evaluated[index];
    const level=card.orange?.value??strengths.get(card.name)??0;
    const stars=card.blue?.value??0;
    const added=visibleAdditions(result,card);
    const reinforcement=card.name?reinforcementValue(result,card):null;
    const score=(rated.score??(45+level+(card.name?3:0)+added*2+(reinforcement?.points??0)))+stars*.3;
    const facts=[level?`Stufe ${level}`:'',stars?`${stars} Sterne`:'',added?`+${card.quantity} Figuren`:''].filter(Boolean);
    const reason=rated.score!==null?rated.reason:reinforcement?.reason??(facts.length?facts.join(' · '):'Ersatzwahl nach sichtbarer Kartenposition.');
    return {index,position:card.position??index,name:card.name,score,reason};
  });
  const positions=[1,0,2,3];
  options.sort((a,b)=>b.score-a.score||positions.indexOf(a.position)-positions.indexOf(b.position));
  return preferReinforcement(result,options,evaluated);
}
