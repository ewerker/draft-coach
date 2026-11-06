import {answerTactics,proposeReview} from './review-gpt.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LatestQueue} from './pipeline.mjs';
import {allowedNames,sameReinforcementVariant,observeChosenReinforcement,observeDraftLineup,recommend} from './advice.mjs';
import {displayNames,translate,reviewMessage,reviewTapReason,tacticText} from './public/language.mjs';
import {quickAdvice} from './quick-advice.mjs';
const collection=JSON.parse(await readFile(new URL('./data/sample-collection.json',import.meta.url),'utf8'));
const db=JSON.parse(await readFile(new URL('./data/matchups.json',import.meta.url),'utf8'));
test('English display names and questions preserve German card keys',()=>{
  assert.equal(translate('Auswahl','en'),'Choose a view');
  assert.equal(displayNames('Verwüster, Drakling, ¡ZAS!','en'),'Waster, Whelp, ZAP!');
  const cards=['Drakling','Schnecke','Kapitän','Agent B'];
  const rules=[{offer:'Schnecke',enemy:'Drakling',title:'Schnecke gegen Drakling',reason:'Flächenschaden',weight:8,status:'aktiv'}];
  const answer=quickAdvice('What counters Whelp?',cards,rules,[],[],'en');
  assert.deepEqual(answer.subjects,['Drakling']);
  assert.match(answer.summary,/Counters to Whelp/);
  assert.equal(answer.entries.length,1);
  assert.deepEqual(quickAdvice('What counters it?',cards,rules,[],answer.subjects,'en').subjects,['Drakling']);
});
test('latest waiting image replaces intermediate image; stale result is not published',async()=>{
  let release;const gate=new Promise(r=>release=r);const runs=[],published=[];
  const q=new LatestQueue(async j=>{runs.push(j.id);if(j.id===1)await gate;return j.id;},(j,r)=>published.push(r),()=>assert.fail());
  q.push({id:1});q.push({id:2});q.push({id:3});release();
  await new Promise(r=>setTimeout(r,20));assert.deepEqual(runs,[1,3]);assert.deepEqual(published,[3]);
});
test('older captured image cannot replace a newer reference job',async()=>{
  const seen=[];const q=new LatestQueue(async j=>j.id,(j,r)=>seen.push(r),()=>{});q.supersede(5);q.push({id:4});await q.drain();assert.deepEqual(seen,[]);
});
test('Draft uses selected figures; both modes restrict spells to selection',()=>{
  const draft=allowedNames(collection,'draft'),arena=allowedNames(collection,'arena');assert(draft.has('Merlinor'));assert(!draft.has('TNT'));assert(arena.has('TNT'));assert(!arena.has('Feensegen'));assert(arena.has('Minenfeld'));
});
test('recommendation only names a visible offer',()=>{
  const a=recommend({enemy:[{name:'Kupid'}],offers:[{name:'Ritter',action:'add'},{name:'Kapitän',action:'add'}]},'arena',collection,db);assert(a.best);assert(['Ritter','Kapitän'].includes(a.best.name));
});
test('unknown card, unknown action and multiplication without counts withhold the tip',()=>{
  for(const offer of [{name:null,action:'add'},{name:'Astra',action:'add'},{name:'TNT',action:'unknown'},{name:'TNT',action:'multiply'}])assert.equal(recommend({enemy:[],offers:[offer]},'arena',collection,db).best,null);
});
test('a forbidden Draft offer withholds a complete recommendation',()=>{
  const a=recommend({enemy:[{name:'Kupid'}],offers:[{name:'TNT',action:'add'},{name:'Merlinor',action:'add'}]},'draft',collection,db);assert.equal(a.best,null);
});
test('tactics change ranking only in the matching mode and phase and only in the selected rule status',()=>{
  const snapshot={phase:'battle_choice',enemy:[{name:'Agent B'}],offers:[{name:'Ritter',action:'add'},{name:'Merlinor',action:'add'}]};
  const plain=recommend(snapshot,'arena',collection,db);
  const target=plain.evaluated.find(card=>card.name!==plain.best.name).name;
  const rule={title:'Test',reason:'Gegner bekannt',offer:target,enemy:'Agent B',mode:'arena',phase:'battle_choice',weight:20,status:'test'};
  const run=(result=snapshot,mode='arena',status='test',trial=false)=>recommend(result,mode,collection,db,false,[{...rule,status}],trial);
  assert.equal(run().best.name,plain.best.name);
  assert.equal(run(snapshot,'arena','notiz',true).best.name,plain.best.name);
  assert.equal(run(snapshot,'arena','test',true).best.name,target);
  assert.equal(run(snapshot,'arena','aktiv').best.name,target);
  assert.equal(run({...snapshot,enemy:[]},'arena','aktiv').evaluated.find(card=>card.name===target).delta,0);
  assert.equal(run({...snapshot,phase:'deck_choice'},'arena','aktiv').evaluated.find(card=>card.name===target).delta,0);
  assert.equal(run(snapshot,'draft','aktiv').evaluated.find(card=>card.name===target).rules?.length??0,0);
});
test('a custom rule for a recognized card outside the rules catalog stays provisional',()=>{
  const rule={title:'Astra',reason:'Eigene Beobachtung',offer:'Astra',enemy:'',mode:'beide',phase:'alle',weight:10,status:'aktiv'};
  const snapshot={phase:'battle_choice',offers:[{name:'Astra',action:'add'}]};
  const result=recommend(snapshot,'arena',collection,db,false,[rule]);
  assert.equal(result.best,null);
  assert.equal(result.provisional.name,'Astra');
  const doubled=recommend({...snapshot,offers:[{name:'Astra',action:'multiply'}]},'arena',collection,db,false,[rule]);
  assert.equal(doubled.best,null);
  assert.equal(doubled.provisional.name,'Astra');
});
test('fallback chooses the strongest visible spell slot and a fixed position when values are open',()=>{
  const result={phase:'spell_choice',offers:[{name:null,position:0,action:'spell',orange:{value:10}},
    {name:null,position:2,action:'spell',orange:{value:11}}]};
  const advice=recommend(result,'draft',collection,db);
  assert.equal(advice.best,null);
  assert.equal(advice.fallback.position,2);
  const unknown=[0,1,2].map(position=>({name:null,position,action:'unknown'}));
  assert.equal(recommend({phase:'battle_choice',offers:unknown},'arena',collection,db).fallback.position,1);
  assert.equal(recommend({phase:'battle',offers:unknown},'arena',collection,db).fallback,null);
});
test('recognized additions count once in normal and fallback battle rankings',()=>{
  const ritter={name:'Ritter',action:'add',quantity:1};
  const offers=[ritter,{...ritter,quantity:3}];
  const score=result=>recommend({phase:'battle_choice',offers:result},'arena',collection,db);
  const full=score(offers);
  assert.equal(full.best.index,1);
  assert.equal(full.best.score-full.evaluated[0].score,4);
  const partial=score([...offers,{name:null,action:'unknown'}]);
  assert.equal(partial.fallback.index,1);
  assert.equal(partial.fallback.score,full.best.score);
});
test('battle prefers reinforcement over +2 but respects small stacks and strong counters',()=>{
  const add={name:'Ritter',action:'add',quantity:2};
  const pick=(offers,own=[],enemy=[],matchups=[])=>recommend({phase:'battle_choice',offers,own,enemy},'arena',collection,matchups).best;
  for(const action of ['multiply','upgrade']){
    assert.equal(pick([add,{...add,action,quantity:null}]).index,1);
  }
  assert.equal(pick([add,{...add,action:'upgrade'}],[{name:'Ritter'}]).index,0);
  assert.equal(pick([{name:'Spartheus',action:'upgrade'},{name:'Sniper',action:'add',quantity:2}],
    [],[{name:'Schnecke'}],db).name,'Sniper');
});
test('recognized Astra reinforcement can win a close draft comparison without bespoke matchup data',()=>{
  const draft=structuredClone(collection);
  draft.units.active_lineup=['Astra','Merlinor','Zerstörer','Assassine'];
  const enemy=[{name:'Drakling'},{name:'Splime'}];
  const astra={name:'Astra',orange:{value:7}};
  const pick=offers=>recommend({phase:'battle_choice',enemy,offers},'draft',draft,db);
  const doubled=pick([{...astra,action:'multiply',quantity:2},{...astra,action:'upgrade'},
    {name:'Merlinor',action:'add',quantity:1}]);
  assert.equal(doubled.best,null);
  assert.equal(doubled.fallback.index,0);
  const upgraded=pick([{...astra,action:'upgrade'},{...astra,action:'add',quantity:2},
    {name:'Zerstörer',action:'add',quantity:2}]);
  assert.equal(upgraded.fallback.index,0);
});
test('draft learns from distinct normal offers and can already recommend a newly observed unit',()=>{
  const tracker={seen:new Set(),windows:new Set(),counts:new Map(),confirmed:false};
  const owned=new Set(collection.units.units.map(card=>card.name));
  const offer=(name,position)=>({name,position,nameSource:'Kartenbeschriftung',similarity:.85,captionMargin:.15,action:'add',quantity:2});
  const frame=(names,deckEvidence=true)=>({phase:'battle_choice',deckEvidence,offers:names.map(offer)});
  const first=frame(['Blutrebe','Merlinor','Assassine']);
  observeDraftLineup(tracker,frame(['TNT','Sniper','Kapitän'],false),owned);
  assert.equal(tracker.seen.size,0);
  assert.equal(observeDraftLineup(tracker,first,owned),null);
  assert.equal(observeDraftLineup(tracker,first,owned),null);
  assert.equal(tracker.counts.get('Blutrebe'),1);
  const a=recommend({...first,observedDraftUnits:[...tracker.seen]},'draft',collection,db);
  assert.notEqual(a.evaluated[0].score,null);
  assert.equal(observeDraftLineup(tracker,frame(['Zerstörer','Assassine','Blutrebe']),owned),null);
  assert.deepEqual(new Set(observeDraftLineup(tracker,frame(['Merlinor','Zerstörer','Assassine']),owned)),
    new Set(['Blutrebe','Merlinor','Assassine','Zerstörer']));
});

test('a tracked group makes upgrading more valuable than adding two troops',()=>{
  const counts=new Map();
  observeChosenReinforcement(counts,{name:'Parasit',action:'multiply',quantity:2});
  assert.equal(counts.has('Parasit'),false);
  observeChosenReinforcement(counts,{name:'Parasit',action:'add',quantity:4});
  observeChosenReinforcement(counts,{name:'Parasit',action:'multiply',quantity:2});
  const offers=[{name:'Parasit',action:'upgrade'},{name:'TNT',action:'add',quantity:2}];
  const enemy=[{name:'Drakling'},{name:'TNT'}];
  const rules=[{offer:'TNT',enemy:'Drakling',phase:'battle_choice',mode:'beide',weight:5,status:'aktiv'}];
  const pick=ownReinforcements=>recommend({phase:'battle_choice',offers,enemy,ownReinforcements},
    'arena',collection,db,false,rules).best.name;
  assert.equal(pick({}),'TNT');
  assert.equal(pick(Object.fromEntries(counts)),'Parasit');
});

test('deck choice favors a ranged unit when Sixshoot and Captain are already selected',()=>{
  const offers=['Königlop','Sniper','Boomling'].map(name=>({name,action:'add',orange:{value:name==='Sniper'?11:12}}));
  const pick=ownDeckPicks=>recommend({phase:'deck_choice',offers,ownDeckPicks},'arena',collection,db).best.name;
  assert.equal(pick(['Sixshoot','Kapitän','Totem']),'Sniper');
  assert.equal(pick(['Sixshoot','Kapitän','Merlinor']),'Königlop');
});

test('optional GPT review requests structured output and only attaches a selected crop',async()=>{
  const result={observation:'Snail is visible.',uncertainty:'Outcome unknown.',rule:null};
  for(const image of [undefined,'test-image']){
    const draft=await proposeReview({key:'test-key',model:'test-model',language:'en',evidence:{capture:12},image},
      async (url,options)=>{
        assert.equal(url,'https://api.openai.com/v1/responses');
        const payload=JSON.parse(options.body);
        assert.equal(payload.store,false);
        assert.equal(payload.text.format.strict,true);
        assert.equal(payload.input[0].content.some(part=>part.type==='input_image'),Boolean(image));
        return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]})};
      });
    assert.deepEqual(draft,result);
  }
});

test('review labels, actions and tap statuses have explicit English and German translations',()=>{
  assert.equal(reviewMessage('original','en'),'Original recommendation');
  assert.equal(reviewMessage('clicks','en'),'Tap log');
  assert.equal(reviewMessage('gesendet','en'),'Sent');
  assert.equal(reviewMessage('upgrade','en'),'Upgrade');
  assert.equal(reviewMessage('original','de'),'Damals empfohlen');
  assert.equal(reviewTapReason('Gerät antwortet nicht rechtzeitig.','en'),'Device did not respond in time.');
});

test('seed rules have complete independent German and English text',async()=>{
  const rules=JSON.parse(await readFile(new URL('./data/tactic-seeds.json',import.meta.url),'utf8'));
  for(const rule of rules){
    assert.ok(tacticText(rule,'de')?.title&&tacticText(rule,'de')?.reason,rule.id);
    assert.ok(tacticText(rule,'en')?.title&&tacticText(rule,'en')?.reason,rule.id);
  }
  const rule=rules.find(rule=>rule.id==='forum-2026-11-086');
  assert.equal(tacticText(rule,'en').title,'ZAP! vs. Assassin');
  assert.equal(tacticText(rule,'de').title,'¡ZAS! gegen Assassine');
  assert.equal(tacticText({texts:{de:rule.texts.de}},'en'),null);
});

test('Quick Advice resolves Melinor and sends a bounded text-only AI request',async()=>{
  const rules=[{offer:'Kapitän',enemy:'Merlinor',status:'aktiv',weight:8,texts:{en:{title:'Captain vs. Merlinor',reason:'Captain can hook Merlinor.'}}}];
  const local=quickAdvice('Against Melinor, what can I do?', ['Merlinor','Kapitän'], rules, [], [], 'en');
  assert.deepEqual(local.subjects,['Merlinor']);
  assert.equal(local.entries[0].title,'Captain vs. Merlinor');
  const answer=await answerTactics({key:'fake',model:'gpt-5.4-mini',language:'en',question:'Against Melinor?',knowledge:local.entries},
    async (url,options)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');
      const body=JSON.parse(options.body);
      assert.equal(body.store,false);
      assert.equal(body.max_output_tokens,400);
      assert.equal(JSON.parse(body.input).question,'Against Melinor?');
      return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Try Captain.'}]}]})};
    });
  assert.equal(answer,'Try Captain.');
});

test('a visually ambiguous reinforcement never doubles the whole tracked stock',()=>{
  const counts=new Map([['Totem',12]]);
  const sample=Array(432).fill(3), other=Array(432).fill(5);
  const offer={name:'Totem',action:'multiply',quantity:2,variantIndex:1,variantSample:sample};
  observeChosenReinforcement(counts,offer);
  observeChosenReinforcement(counts,{...offer,variantIndex:undefined,variantUncertain:true});
  assert.equal(counts.get('Totem'),12);
  assert.equal(sameReinforcementVariant(offer,{variantSample:[...sample]}),true);
  assert.equal(sameReinforcementVariant(offer,{variantSample:other}),false);
  assert.equal(sameReinforcementVariant(offer,{}),false);
  const replay=recommend({phase:'battle_choice',offers:[offer],ownReinforcements:{Totem:12}},'arena',collection,db);
  assert.match(replay.evaluated[0].reason,/Bestand dieser Variante unbekannt/);
});
