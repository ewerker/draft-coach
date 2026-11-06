import {EN_CARD_NAMES,displayNames,tacticText} from './public/language.mjs';

const normalize=text=>text.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const aliases={
  Drakling:['draklings','darklink','darklinks','darkling','darklings','drake','drakelings','whelp','whelps'],
  Zerstörer:['verwuster','verwusterin','waster','destroyer'],
  Parasit:['parasiten','parasite'],
  Kapitän:['kapitane','captain','captains','pirat','piraten'],
  Merlinor:['merliner','melino','merlin'],
  Schildling:['schildlinge','schildkrote','schildkroten','shellbro'],
  Obergeist:['overmind'],
  Gans:['ganse','goose','geese'],
  Schnecke:['schnecken','snail','snails'],
  Assassine:['assassinen','assassin','assassins','assizins'],
  Bienenkorb:['beehive','bee tank','beetank'],
  Spartheus:['sparthaus','spartheaus','spartan','spartans'],
  Kupid:['cupid'],
  Spinne:['spider','matriarch']
};
const swarmAdvice=[
  {title:'Schnecke mit Schutz',detail:'Flächentreffer gegen dicht stehende Gruppen. Gegen Drakling braucht Schnecke Zeit für die erste Salve.',status:'aktiv'},
  {title:'Boomling oder TNT',detail:'Flächenschaden gegen dichte Gruppen. TNT muss nah genug herankommen. Frühe Explosionen können von Gänsen abgefangen werden.',status:'aktiv'},
  {title:'Verwüster gegen Bodenschwärme',detail:'Bodensäure kann Wege versperren. Gegen schwebende Drakling greift diese Taktik nicht.',status:'aktiv'}
];
const combinations=[
  ['Gans','Drakling','Die schnelle Gans fängt frühe Treffer ab und kann mit Drakling mithalten.','https://www.reddit.com/r/DraftShowdown/comments/1v0ficg/draft_showdown_guide_what_actually_matters_in/'],
  ['Spartheus','Merlinor','Spartheus fängt die erste Salve ab und gibt Merlinor Zeit für konzentrierten Schaden.','https://forum.gamer.com.tw/C.php?bsn=84101&snA=8'],
  ['Spartheus','Schnecke','Eine stabile Front gibt der langsamen Schnecke Zeit für weitere Flächentreffer.','https://www.reddit.com/r/DraftShowdown/comments/1v0ficg/draft_showdown_guide_what_actually_matters_in/'],
  ['Blutrebe','Merlinor','Blutrebe hält Gegner vorne, während Merlinor aus dem Schutz heraus angreift.','https://www.reddit.com/r/DraftShowdown/comments/1v2rrmi/best_counters_for_units/'],
  ['Spartheus','Totem','Das Totem unterstützt die bestehende Front. Der Nutzen hängt vom Ausbau und davon ab, ob das Totem geschützt steht.','https://www.reddit.com/r/DraftShowdown/comments/1tojy1g/made_a_tier_list_of_all_the_units_and_the_spells/']
];

export function quickAdvice(question,cards,rules,matchups,context=[],language='de'){
  const text=normalize(question);
  const contains=(value,word)=>(' '+value+' ').includes(' '+word+' ');
  const known=new Set(cards);
  const named=cards.filter(card=>[normalize(card),normalize(EN_CARD_NAMES[card]??card),...(aliases[card]??[])].some(alias=>contains(text,alias)));
  const synergy=/synerg|kombin|combin|partner|zusammen|passt|works? well with|pairs? with|pair with/.test(text);
  const attacks=/stark gegen|gut gegen|bekampf|angreifen|kontert|kontern|good against|strong against|should .* counter/.test(text);
  const outgoing=/\b(gegen wen|who does|what does)\b/.test(text)||attacks&&!/\b(was|wer|wie|gegenmittel|hilfe)\b/.test(text);
  const names=named.length?named:/^(und|dann|and|then)|\b(dagegen|damit|ihn|ihr|sie|ihm|it|them|that)\b/.test(text)
    ?context.filter(card=>known.has(card)):[];
  const swarm=/schwarm|schwarme|swarm|massen/.test(text);
  if(!names.length){
    if(swarm)return {summary:language==='en'?'Against swarms, use area damage and check whether the units are on the ground or airborne.':'Gegen Schwärme zählt Flächenschaden und die Unterscheidung zwischen Boden und Luft.',entries:swarmAdvice,subjects:[]};
    return {summary:language==='en'?'Which unit or spell do you mean? You can also ask about swarms.':'Welche Figur oder welchen Zauber meinst du? Du kannst auch nach einem Schwarm fragen.',entries:[],subjects:[]};
  }
  const entries=[];
  for(const name of names.slice(0,3)){
    const selected=(other)=>names.length===1||names.includes(other);
    const matches=matchups.filter(row=>row.reaction_item===name);
    if(synergy){
      for(const [a,b,detail,source] of combinations){
        if(a===name&&selected(b)||b===name&&selected(a))
          entries.push({title:a+' · '+b,detail,status:'lexikon',sources:[source]});
      }
      const notes=matches.filter(row=>row.synergy_note&&selected(row.next_figure));
      for(const row of notes)entries.push({title:name+' · '+(row.next_figure||'Kombination'),detail:row.synergy_note,status:'lexikon'});
      for(const rule of rules.filter(rule=>rule.offer===name&&rule.status==='notiz'&&/eigen|synerg|front|schutz/i.test(rule.reason))){
        if(names.length===1||names.some(other=>other!==name&&contains(normalize(rule.reason),normalize(other))))entries.push(fromRule(rule,null,language));
      }
      continue;
    }
    const seen=new Set();
    for(const rule of rules.filter(rule=>
      outgoing?rule.offer===name&&rule.enemy&&rule.weight>0&&selected(rule.enemy):
        (rule.enemy===name&&rule.weight>0&&selected(rule.offer)||rule.offer===name&&rule.weight<0&&selected(rule.enemy))
    ).sort((a,b)=>rank(b)-rank(a)||Math.abs(b.weight)-Math.abs(a.weight))){
      const other=outgoing?rule.enemy:rule.enemy===name?rule.offer:rule.enemy;
      if(!other||seen.has(other))continue;
      seen.add(other);
      const title=rule.weight<0
        ?rule.offer+' gegen '+rule.enemy+' mit Vorsicht'
        :rule.offer+' gegen '+rule.enemy;
      entries.push(fromRule(rule,title,language));
    }
    for(const row of matchups.filter(row=>outgoing?row.reaction_item===name:row.enemy_item===name).sort((a,b)=>b.base_score-a.base_score)){
      const other=outgoing?row.enemy_item:row.reaction_item;
      if(seen.has(other)||!selected(other))continue;
      // A newer negative rule takes precedence over an older positive suggestion.
      if(rules.some(rule=>rule.offer===row.reaction_item&&rule.enemy===row.enemy_item&&rule.weight<0&&rule.status!=='notiz'))continue;
      seen.add(other);
      entries.push({title:other+' · '+name,detail:row.reason,status:'lexikon'});
    }
  }
  const unique=[...new Map(entries.map(entry=>[entry.title+' '+entry.detail,entry])).values()].slice(0,6);
  const label=names.join(', ');
  if(language==='en'){
    const display=displayNames(label,'en');
    return {subjects:names,summary:unique.length
      ?(synergy?'Combinations with ':outgoing?'Good targets for ':'Counters to ')+display+'. Quantity, upgrades and formation can change the recommendation.'
      :'The local knowledge base has no specific entry for '+display+' for this question.',entries:unique};
  }
  return {subjects:names,summary:unique.length
    ?(synergy?'Kombinationen mit ':outgoing?'Günstige Ziele für ':'Antworten gegen ')+label+'. Menge, Ausbaustufe und Aufstellung können den Tipp ändern.'
    :'Für '+label+' finde ich zu dieser Frage keinen konkreten Eintrag im lokalen Lexikon.',entries:unique};
}

function rank(rule){return rule.status==='aktiv'?2:rule.status==='test'?1:0;}
function fromRule(rule,title,language){
  const text=tacticText(rule,language);
  const reason=text?.reason??(language==='en'?'Rule text is missing in this language.':'Für diese Sprache fehlt der Regeltext.');
  const sources=reason.match(/https?:\/\/[^\s]+/g)??[];
  return {title:text?.title??displayNames(title??rule.offer,language),detail:reason.replace(/https?:\/\/[^\s]+/g,'').trim(),status:rule.status,sources};
}
