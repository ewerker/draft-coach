import {CARDS,buildDatabaseAdvice} from './data/coach-engine.mjs';
export function allowedNames(collection,mode,extended=false) {
  const units=collection.units.units
    .filter(card=>extended||mode==='arena'||collection.units.active_lineup.includes(card.name))
    .map(card=>card.name);
  const spells=extended?collection.spells.spells.map(card=>card.name):collection.spells.active_loadout;
  return new Set([...units,...spells]);
}
export function shouldTrySpell(item,match,auto,spellCount,choice,checking=false){
  return !!(auto&&match?.id&&match.id===item.matchId&&!match.spellOpenedUntil&&item.phase==='battle_choice'&&item.spellButton&&
    spellCount>0&&item.hearts?.own>0&&(checking||(!match.spellRetryAfter||Date.now()>=match.spellRetryAfter)&&match.spellAttemptChoice!==choice)&&
    (item.hearts.own<item.hearts.enemy||!item.advice.best));
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
export function ambiguousReinforcementNames(offers){
  return offers.filter(card=>card.variantIndex).map(card=>card.name);
}
export function sameReinforcementVariant(before,after){
  const a=before?.variantSample,b=after?.variantSample;
  if(!a&&!b)return true;
  if(!a||!b||a.length!==432||b.length!==a.length)return false;
  return a.reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0)/a.length<=.65;
}
export function observeChosenReinforcement(counts, offer){
  if(!offer?.name||!Number.isInteger(offer.quantity)||offer.quantity<1)return;
  const previous=counts.get(offer.name)??0;
  if(offer.action==='add')counts.set(offer.name,previous+offer.quantity);
  if(previous&&!offer.variantIndex&&!offer.variantUncertain&&['multiply','multiply_upgrade'].includes(offer.action))
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
  const reroll=result.phase==='deck_choice'&&result.lastDeckReroll===true&&
    (result.own??[]).filter(card=>card.name).length===3&&!hasRanged&&
    result.offers.length===3&&result.offers.every(card=>card.name&&!card.poolHint&&!deckRanged.has(card.name));
  const hasBacklineAccess=[...ownDeck].some(name=>deckBacklineAccess.has(name));
  const rearThreat=['Bienenkorb','Schnecke'].find(name=>enemy.includes(name)&&
    (result.enemyAdditions?.[name]>=2||(result.enemy??[]).some(card=>card.name===name&&card.action==='add'&&card.quantity>=2)));
  const snail=enemy.includes('Schnecke');
  const rangedOffer=(result.offers??[]).some(card=>deckRanged.has(card.name)&&allowed.has(card.name)&&card.action!=='unknown');
  const captainOffer=(result.offers??[]).some(card=>card.name==='Kapitän'&&allowed.has(card.name)&&card.action!=='unknown');
  const tracked=result.ownReinforcements??{};
  const snipers=result.enemyAdditions?.Sniper??0;
  const agentShortfall=result.phase==='battle_choice'&&enemy.includes('Sniper')&&snipers>=4?
    Math.max(0,Math.ceil(snipers/2)-(tracked['Agent B']??0)):0;
  const underBoomlingFire=result.phase==='battle_choice'&&enemy.includes('Boomling')&&(tracked.Parasit??0)>=4;
  const needsSwarmCover=result.phase==='battle_choice'&&enemy.includes('Gans')&&enemy.includes('Splime')&&
    ownDeck.has('Schnecke')&&(tracked.Schnecke??0)>0&&
    [...deckRanged].some(name=>(tracked[name]??0)>=4)&&(tracked.Drakling??0)<4;
  const needsMerlinorCounter=result.phase==='battle_choice'&&enemy.includes('Merlinor')&&
    !enemy.some(name=>name==='Verwüster'||name==='Zerstörer')&&
    (tracked.Spartheus??0)>=6&&(tracked['Kapitän']??0)<2;
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
    if(result.phase==='deck_choice'&&enemy.includes('Kupid')&&
       !ownDeck.has('Kupid')&&!ownDeck.has('Sniper')&&['Kupid','Sniper'].includes(offer.name)){
      score+=12;
      why+=' Zusätzlicher Fernkampf kann gegen gegnerische Kupid Druck aufbauen.';
    }
    if(result.phase==='battle_choice'&&enemy.includes('Kupid')&&offer.name==='Assassine'&&
       offer.action==='add'&&offer.quantity>=3&&(tracked.Assassine??0)<6){
      score+=34;
      why+=' Gegen Kupid Assassinen für den Angriff auf die Hinterreihe aufbauen; eigener Bestand nur soweit beobachtet.';
    }
    if(result.phase==='battle_choice'&&offer.name==='Agent B'&&offer.action==='add'&&offer.quantity>=2&&
       (tracked.Drakling??0)>=4&&(tracked['Agent B']??0)<4){
      score+=18;
      why+=' Agent B ergänzt vorhandene Draklinge um frühen Zugriff auf die Hinterreihe; Bestand nur aus beobachteten Wahlen.';
    }
    if(result.phase==='battle_choice'&&enemy.includes('Kupid')&&(result.enemyAdditions?.Kupid??0)>=6&&
       ['Schildling','Agent B','Assassine'].includes(offer.name)){
      score+=16;
      why+=' Gegen mindestens sechs beobachtete Kupid wird der Zugriff auf die Hinterreihe höher gewichtet.';
    }
    if(result.phase==='battle_choice'&&enemy.includes('Boomling')&&(tracked.Assassine??0)>=9&&
       offer.name==='Sniper'&&offer.action==='add'&&(tracked.Sniper??0)<4){
      score+=18;
      why+=' Viele Assassinen sind bereits beobachtet; Sniper ergänzt Fernkampf gegen Boomlinge.';
    }
    if(result.phase==='battle_choice'&&snail){
      if(deckRanged.has(offer.name)){
        score+=12;
        why+=' Fernkampf kann die gegnerische Schnecke auf Distanz erreichen.';
      }else if(offer.name==='Kapitän'&&!rangedOffer){
        score+=14;
        why+=' Der Haken bietet Zugriff auf die Schnecke, wenn keine Fernwaffe zur Wahl steht.';
      }else if(offer.name==='TNT'&&(rangedOffer||captainOffer)){
        score-=12;
        why+=' TNT erreicht die Schnecke hinter der gegnerischen Front oft schwer.';
      }
    }
    if(result.phase==='battle_choice'&&rearThreat&&(deckBacklineAccess.has(offer.name)||offer.name==='Sniper')){
      score+=14;
      why+=` Zugriff auf die Hinterreihe ist wichtiger, weil mehrere Einheiten vom Typ ${rearThreat} beobachtet wurden.`;
    }
    if(result.phase==='battle_choice'&&offer.name==='Schildling'&&enemy.includes('Bienenkorb')&&
       (tracked.Schildling??0)<4&&offer.action==='add'){
      score+=16;
      why+=' Schildling kann zum Bienenkorb in der Hinterreihe vordringen.';
    }
    if(result.phase==='battle_choice'&&offer.name==='Kupid'&&enemy.includes('Ingenieur')){
      score-=8;
      why+=' Kupid wird gegen Ingenieur schwächer gewichtet.';
    }
    if(needsMerlinorCounter&&offer.name==='Kapitän'&&offer.action==='add'){
      score+=26;
      why+=' Spartheus deckt bereits die Front ab. Der Kapitän kann Merlinor aus der Hinterreihe ziehen.';
    }
    if(needsSwarmCover&&offer.name==='Drakling'&&offer.action==='add'&&offer.quantity>=3){
      score+=12;
      why+=' Fernkampf steht bereits. Draklinge ergänzen die Abwehr gegen Gänse und Splimes und entlasten die eigene Schnecke.';
    }
    if(underBoomlingFire&&offer.name==='Parasit'){
      score-=14;
      why+=' Weitere Parasiten müssen erst durch den Beschuss der Boomlinge.';
    }else if(underBoomlingFire&&deckRanged.has(offer.name)){
      score+=12;
      why+=' Fernkampf ergänzt die vorhandenen Parasiten gegen den Beschuss der Boomlinge.';
    }
    if(agentShortfall&&offer.name==='Agent B'&&offer.action==='add'&&offer.quantity>=2){
      score+=6*Math.min(agentShortfall,offer.quantity,4);
      why+=` Gegen ungefähr ${snipers} gegnerische Sniper fehlen noch ${agentShortfall} Agent B für den Angriff auf die Hinterreihe.`;
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
      rules:applied.map(({title,reason,texts,weight,status})=>({title,reason,texts,weight,status}))};
  });
  warnings.push('Basiswertung aus der bisherigen App. Mengen, gegnerische Stärken und eigene Synergien sind noch nicht vollständig bewertet.');
  const scored=evaluated.filter(card=>card.score!==null).sort((a,b)=>b.score-a.score);
  const expectedOffers=result.phase==='spell_choice'?Math.min(3,collection.spells.active_loadout.length):
    ['battle_choice','deck_choice'].includes(result.phase)&&result.offers?.some(card=>Number.isInteger(card.position))?3:0;
  const incompleteSlots=evaluated.length<expectedOffers||(result.offers??[]).some(card=>card.visible===false&&!card.name);
  const complete=!result.specialStep&&!incompleteSlots&&evaluated.length>0&&scored.length===evaluated.length&&!scored.some(card=>card.ruleOnly);
  const pick=preferReinforcement(result,scored,evaluated);
  const fallback=complete?null:trialPick(result,evaluated,strengths);
  return {best:complete?pick:null,provisional:complete?null:pick,fallback,evaluated,warnings,withheld:!complete,reroll,expectedOffers,incompleteSlots};
}

function visibleAdditions(result,offer){
  return result.phase==='battle_choice'&&offer.action==='add'?Math.min(offer.quantity??0,12):0;
}

function reinforcementValue(result,offer){
  if(result.phase!=='battle_choice'||!['multiply','upgrade','multiply_upgrade'].includes(offer.action))return null;
  const uncertain=offer.variantIndex||result.ownVariantUncertain?.includes(offer.name);
  const tracked=uncertain?0:result.ownReinforcements?.[offer.name]??0;
  const count=uncertain?null:Math.max(tracked,result.own?.filter(card=>card.name===offer.name).length??0)||null;
  const upgrade=offer.action!=='multiply';
  const double=offer.action!=='upgrade';
  const points=(upgrade?(count===null?11:Math.min(count*(count>2?4:2),30)):0)+
    (double?(count===null?14:Math.min(count*3,20)):0);
  const action=upgrade&&double?'Verdopplung mit Aufwertung':upgrade?'Aufwertung':'Verdopplung';
  const scope=uncertain?'Bestand dieser Variante unbekannt':tracked&&count===tracked?`mindestens ${tracked} aus beobachteten Wahlen`:count===null?'Bestand unbekannt':`${count} vorhandene Figuren`;
  return {points,count,reason:`${action} bevorzugt (${scope}).`,
    preferIfClose:!uncertain&&(count===null||count>2||(double&&count>=2))};
}

function preferReinforcement(result,ranked,evaluated){
  const first=ranked[0];
  if(!first||result.phase!=='battle_choice')return first??null;
  const offer=result.offers[first.index];
  if(offer.action!=='add'||!Number.isInteger(offer.quantity)||offer.quantity>3)return first;
  return ranked.find(candidate=>{
    const alternative=result.offers[candidate.index];
    const gap=first.score-candidate.score;
    const value=reinforcementValue(result,alternative);
    const margin=offer.quantity===1&&alternative.action==='upgrade'&&value?.count>=3?5:4;
    return evaluated[candidate.index].score!==null&&gap<=margin&&
      (value?.preferIfClose||
       (gap===0&&offer.quantity===1&&alternative.name===offer.name&&alternative.action==='upgrade'));
  })??first;
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
