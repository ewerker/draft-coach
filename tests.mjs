import {followVariantChoice,observeVariantEvidence,makeReviewFrame,selectEvidenceIds} from './review.mjs';
import {createArchive} from './archive.mjs';
import {DatabaseSync} from 'node:sqlite';
import {resolveBuild} from './build-info.mjs';
import {answerTactics,proposeReview,extractResearchFacts} from './review-gpt.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,rename,unlink,mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {LatestQueue,autoCaptureBusy,nextLossStreak,mergeEnemyEvent,preferEnemyDeckCard} from './pipeline.mjs';
import {allowedNames,sameReinforcementVariant,observeChosenReinforcement,observeDraftLineup,observeOwnCardValues,shouldTrySpell,recommend} from './advice.mjs';
import {displayNames,translate,reviewMessage,reviewTapReason,tacticText} from './public/language.mjs';
import {quickAdvice} from './quick-advice.mjs';
const collection=JSON.parse(await readFile(new URL('./data/sample-collection.json',import.meta.url),'utf8'));
const db=JSON.parse(await readFile(new URL('./data/matchups.json',import.meta.url),'utf8'));
test('direct backline attackers are preferred against Snail, Cupid and Sniper',()=>{
  for(const threat of ['Schnecke','Kupid','Sniper'])for(const attacker of ['Agent B','Assassine']){
    const result={phase:'battle_choice',enemy:[{name:threat}],offers:[{name:attacker,action:'add',quantity:2},{name:'Sniper',action:'add',quantity:2},{name:'Sixshoot',action:'add',quantity:2}]};
    const advice=recommend(result,'arena',collection,db);
    assert.equal(advice.best?.name,attacker,`${attacker} against ${threat}`);
    assert.match(advice.best.reason,/Direkter Angriff/);
  }
});
test('builds available Sniper against an enemy Sniper when no direct attacker is offered',()=>{
  const result={phase:'battle_choice',enemy:[{name:'Sniper'},{name:'TNT'},{name:'Splime'}],offers:[{name:'TNT',action:'add',quantity:2},{name:'Sixshoot',action:'add',quantity:2},{name:'Sniper',action:'add',quantity:2}]};
  const advice=recommend(result,'arena',collection,db);
  assert.equal(advice.best?.name,'Sniper');
  assert.match(advice.best.reason,/direkter Hinterlandangriff wird nicht angeboten/);
  const developed=recommend({...result,ownReinforcements:{Sniper:4}},'arena',collection,db);
  assert.doesNotMatch(developed.evaluated[2].reason,/direkter Hinterlandangriff wird nicht angeboten/);
  const noThreat=recommend({...result,enemy:[{name:'Ritter'}]},'arena',collection,db);
  assert.doesNotMatch(noThreat.evaluated[2].reason,/direkter Hinterlandangriff wird nicht angeboten/);
});
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
test('partially visible choice trays withhold green advice',()=>{
  const offers=['Merlinor','Kapitän','Spartheus'].map((name,position)=>({name,position,action:'add',quantity:1}));
  const evaluate=offers=>recommend({phase:'battle_choice',offers},'arena',collection,db);
  assert.equal(evaluate(offers).incompleteSlots,false);
  assert.equal(evaluate(offers.slice(0,2)).best,null);
  assert.equal(evaluate([...offers.slice(0,2),{position:2,name:null,action:'unknown',visible:false}]).incompleteSlots,true);
  assert.equal(recommend({phase:'spell_choice',offers:[{position:0,name:'Minenfeld',action:'spell'}]},
    'arena',collection,db).best,null);
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

test('reroll is suggested only with a verified last slot and no ranged unit',()=>{
  const own=['Totem','Spartheus','Kapitän'].map(name=>({name}));
  const offers=['Gans','Drakling','TNT'].map(name=>({name,action:'add'}));
  const frame={phase:'deck_choice',own,offers,lastDeckReroll:true};
  const evaluate=changes=>recommend({...frame,...changes},'arena',collection,db).reroll;
  assert.equal(evaluate({}),true);
  assert.equal(evaluate({lastDeckReroll:false}),false);
  assert.equal(evaluate({own:own.slice(0,2)}),false);
  assert.equal(evaluate({ownDeckPicks:['Merlinor']}),false);
  assert.equal(evaluate({offers:[...offers.slice(0,2),{name:'Sniper',action:'add'}]}),false);
});

test('a tied upgrade beats adding one of the same unit',()=>{
  const offers=[{name:'Merlinor',action:'add',quantity:1},{name:'Merlinor',action:'upgrade'}];
  const result={phase:'battle_choice',offers,ownReinforcements:{Merlinor:1}};
  const advice=recommend(result,'arena',collection,db);
  assert.equal(advice.evaluated[0].score,advice.evaluated[1].score);
  assert.equal(advice.best.index,1);
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

test('eight observed Snipers increase the Agent B target to four',()=>{
  const offers=[2,4].map(quantity=>({name:'Agent B',action:'add',quantity}));
  const evaluate=count=>recommend({phase:'battle_choice',offers,enemy:[{name:'Sniper',action:'upgrade'}],
    enemyAdditions:{Sniper:8},ownReinforcements:{'Agent B':count}},'arena',collection,db).evaluated;
  const none=evaluate(0),two=evaluate(2),four=evaluate(4);
  assert.equal(none[1].score-four[1].score,24);
  assert.equal(two[0].score-four[0].score,12);
  assert.match(two[0].reason,/fehlen noch 2 Agent B/);
  assert.doesNotMatch(four[0].reason,/fehlen noch/);
});

test('reinforces swarm cover once Snail and ranged units are established against Goose and Splime',()=>{
  const offers=[{name:'Sniper',action:'add',quantity:2},{name:'Drakling',action:'add',quantity:4}];
  const threats=['Gans','Splime','Schnecke'].map(name=>({name}));
  const evaluate=(ownReinforcements,enemy=threats)=>recommend({
    phase:'battle_choice',offers,enemy,ownDeckPicks:['Schnecke','Sniper','Drakling'],ownReinforcements
  },'arena',collection,db);
  assert.equal(evaluate({Schnecke:4,Sniper:10}).best.name,'Drakling');
  assert.equal(evaluate({Schnecke:4,Sniper:2}).best.name,'Sniper');
  assert.equal(evaluate({Schnecke:4,Sniper:10,Drakling:4}).best.name,'Sniper');
  assert.equal(evaluate({Schnecke:4,Sniper:10},[{name:'Schnecke'}]).best.name,'Sniper');
});

test('an established Spartheus frontline makes room for a Captain against Merlinor',()=>{
  const offers=[{name:'Spartheus',action:'upgrade'},{name:'Kapitän',action:'add',quantity:1}];
  const merlinor=[{name:'Merlinor'}];
  const evaluate=(enemy,ownReinforcements)=>recommend({phase:'battle_choice',offers,enemy,ownReinforcements},
    'arena',collection,db).evaluated[1];
  const early=evaluate(merlinor,{Spartheus:3});
  const ready=evaluate(merlinor,{Spartheus:9});
  assert.ok(ready.score>early.score);
  assert.match(ready.reason,/aus der Hinterreihe ziehen/);
  for(const [enemy,own] of [[merlinor,{Spartheus:9,Kapitän:2}],
    [[...merlinor,{name:'Verwüster'}],{Spartheus:9}],[[],{Spartheus:9}]]){
    assert.doesNotMatch(evaluate(enemy,own).reason,/aus der Hinterreihe ziehen/);
  }
});

test('builds Assassin backline access against Cupid when the observed force is small',()=>{
  const offers=[
    {name:'Merlinor',position:0,action:'upgrade'},
    {name:'Assassine',position:1,action:'add',quantity:3},
    {name:'Parasit',position:2,action:'add',quantity:2}
  ];
  const evaluate=(enemy,ownReinforcements)=>recommend({phase:'battle_choice',offers,enemy,
    ownReinforcements},'arena',collection,db).evaluated[1];
  const againstCupid=evaluate([{name:'Kupid'}],{Merlinor:16});
  assert.match(againstCupid.reason,/Assassinen für den Angriff auf die Hinterreihe/);
  assert.doesNotMatch(evaluate([{name:'Kupid'}],{Assassine:6}).reason,/Assassinen für den Angriff auf die Hinterreihe/);
  assert.doesNotMatch(evaluate([{name:'Splime'}],{}).reason,/Assassinen für den Angriff auf die Hinterreihe/);
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

test('variant evidence links the first timely field image in the same round',()=>{
  const match={variantEvidence:[]},hearts={own:2,enemy:3};
  const offer={name:'Totem',action:'multiply',variantIndex:2};
  followVariantChoice(match,40,offer,hearts,1000,'first choice');
  observeVariantEvidence(match,{id:41,started:980},{phase:'battle',hearts});
  observeVariantEvidence(match,{id:42,started:1200},{phase:'battle_choice',hearts},'first choice');
  assert.equal(match.variantEvidence.length,0);
  observeVariantEvidence(match,{id:43,started:1400},{phase:'battle',hearts});
  assert.equal(match.variantEvidence.length,0);
  observeVariantEvidence(match,{id:44,started:1450},{phase:'battle',hearts});
  assert.deepEqual(match.variantEvidence[0],{before:40,after:44,card:'Totem',action:'multiply',variant:2,hearts});
  followVariantChoice(match,44,offer,hearts,1500);
  observeVariantEvidence(match,{id:45,started:1600},{phase:'battle',hearts:{own:1,enemy:3}});
  assert.equal(match.variantEvidence.length,1);
  followVariantChoice(match,46,offer,hearts,1700,'first choice');
  observeVariantEvidence(match,{id:47,started:1750},{phase:'battle_choice',hearts},'different choice');
  observeVariantEvidence(match,{id:48,started:1800},{phase:'battle',hearts});
  assert.equal(match.variantEvidence.length,1);
  followVariantChoice(match,49,offer,null,1850,'first choice');
  assert.equal(match.pendingVariantEvidence,null);
});


test('own collection values require repeated confident readings and ignore enemies and temporary upgrades',()=>{
  const unit={name:'Agent B',bottom_badge:10,blue_star:7},pending=new Map();
  const card={name:'Agent B',nameSource:'Kartenbeschriftung',similarity:.95,captionMargin:.2,action:'add',orange:{value:11,similarity:.95},blue:{value:8,similarity:.95}};
  const frame={phase:'battle_choice',offers:[card],enemy:[{...card,orange:{value:20,similarity:1}}]};
  assert.equal(observeOwnCardValues(pending,frame,[unit])[0],unit);
  assert.deepEqual(observeOwnCardValues(pending,frame,[unit])[0],{...unit,bottom_badge:11,blue_star:8});
  const other=new Map();
  const upgrade={...frame,offers:[{...card,action:'upgrade'}]};
  observeOwnCardValues(other,upgrade,[unit]);
  assert.equal(observeOwnCardValues(other,upgrade,[unit])[0],unit);
  const uncertain={...frame,offers:[{...card,captionMargin:.01}]};
  observeOwnCardValues(other,uncertain,[unit]);
  assert.equal(observeOwnCardValues(other,uncertain,[unit])[0],unit);
  const lower={...frame,offers:[{...card,orange:{value:9,similarity:1},blue:{value:6,similarity:1}}]};
  observeOwnCardValues(other,lower,[unit]);
  assert.equal(observeOwnCardValues(other,lower,[unit])[0],unit);
});


test('existing Assassin mass raises Sniper reinforcement against Boomling without applying to early choices',()=>{
  const offers=[{name:'Sniper',action:'add',quantity:2},{name:'Assassine',action:'add',quantity:3}];
  const score=(ownReinforcements,enemy=[{name:'Boomling'}])=>recommend({phase:'battle_choice',offers,enemy,ownReinforcements},'arena',collection,db).evaluated[0];
  const early=score({Assassine:3}),established=score({Assassine:9}),enoughSnipers=score({Assassine:9,Sniper:4});
  assert.equal(established.score-early.score,18);
  assert.match(established.reason,/Viele Assassinen/);
  assert.doesNotMatch(enoughSnipers.reason,/Viele Assassinen/);
  assert.doesNotMatch(score({Assassine:9},[{name:'Ritter'}]).reason,/Viele Assassinen/);
});


test('failed spell attempt does not block card choice on the same offer',()=>{
  const item={matchId:'m',phase:'battle_choice',spellButton:[1,2,3,4],hearts:{own:2,enemy:3},advice:{best:{index:0}}};
  const match={id:'m'};
  assert.equal(shouldTrySpell(item,match,true,3,'choice-a'),true);
  match.spellAttemptChoice='choice-a';
  assert.equal(shouldTrySpell(item,match,true,3,'choice-a'),false);
  assert.equal(shouldTrySpell(item,match,true,3,'choice-a',true),true);
  assert.equal(shouldTrySpell(item,match,true,3,'choice-b'),true);
  match.spellRetryAfter=Date.now()+30000;
  assert.equal(shouldTrySpell(item,match,true,3,'choice-b'),false);
  match.spellRetryAfter=Date.now()-1;
  assert.equal(shouldTrySpell(item,match,true,3,'choice-b'),true);
  assert.equal(shouldTrySpell(item,match,false,3,'choice-b'),false);
});


test('automatic capture waits for recognition even when automatic tapping is disabled',()=>{
  const idle={autoBusy:false,capturing:false,manualTapPending:false,recognizing:false,queueRunning:false};
  assert.equal(autoCaptureBusy(idle),false);
  assert.equal(autoCaptureBusy({...idle,recognizing:true}),true);
  assert.equal(autoCaptureBusy({...idle,queueRunning:true}),true);
  assert.equal(autoCaptureBusy({...idle,capturing:true}),true);
});


test('do not open a spell before observed first units or merely because a tip is provisional',()=>{
  const item={matchId:'m',phase:'battle_choice',spellButton:[1,2,3,4],hearts:{own:4,enemy:4},advice:{best:null,fallback:{index:1}}};
  const match={id:'m',ownReinforcements:new Map()};
  assert.equal(shouldTrySpell(item,match,true,3,'opening'),false);
  item.advice={best:null,fallback:null,provisional:null};
  assert.equal(shouldTrySpell(item,match,true,3,'opening'),false);
  match.ownReinforcements.set('Spartheus',3);
  item.advice={best:null,fallback:{index:1}};
  assert.equal(shouldTrySpell(item,match,true,3,'later'),false);
  item.hearts={own:3,enemy:4};
  assert.equal(shouldTrySpell(item,match,true,3,'later'),true);
});


test('loss streak increments across modes, ignores abandoned games and resets after a win',()=>{
  let streak=0;
  for(const outcome of ['verloren','abgebrochen','verloren'])streak=nextLossStreak(streak,outcome);
  assert.equal(streak,2);
  streak=nextLossStreak(streak,'verloren');assert.equal(streak,3);
  streak=nextLossStreak(streak,'gewonnen');assert.equal(streak,0);
  assert.equal(nextLossStreak(streak,'abgebrochen'),0);
});


test('third saved loss stops capture, auto taps and continuum before advancing',async()=>{
  const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function saveMatchOutcome('),end=source.indexOf('let quickAiBusy=',start);
  assert.ok(start>=0&&end>start);
  const ctx={Date,JSON,Number,Map,Promise,Error,path:{join:(...parts)=>parts.join('/')},RUNTIME:'runtime',
    appendFile:async()=>{},logResetAt:0,recentMatchResults:[],matchLogEntry:x=>x,addMatchStats:()=>{},
    nextLossStreak,stopAfterLosses:true,lossStreak:0,lossStopEvent:null,continuum:true,continuation:{step:'saving'},
    autoTap:true,readTipEnabled:true,pendingSpeech:null,interruptibleCapture:null,tapMessage:'',
    state:{auto:true,gameLanguage:'de'},archive:{archiveGames:async()=>{}},
    setAuto(value){ctx.state.auto=value;if(!value)ctx.continuation=null;},setAutoTap(value){ctx.autoTap=value;}};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
  for(const [index,outcome] of ['verloren','abgebrochen','verloren','verloren'].entries()){
    ctx.stoppedMatch={id:'match-'+index,mode:'draft',started:1,ended:index+2,captureDone:Promise.resolve(),captureIds:[],heartTimeline:[],variantEvidence:[],reviewFrames:[]};
    await ctx.saveMatchOutcome({matchId:ctx.stoppedMatch.id,outcome});
    if(index<3)assert.equal(ctx.state.auto,true);
  }
  assert.equal(ctx.lossStreak,3);assert.equal(ctx.state.auto,false);assert.equal(ctx.autoTap,false);
  assert.equal(ctx.continuum,false);assert.equal(ctx.continuation,null);assert.equal(ctx.readTipEnabled,false);
  assert.equal(ctx.lossStopEvent.matchId,'match-3');
  ctx.stopAfterLosses=false;ctx.lossStreak=2;ctx.lossStopEvent=null;ctx.state.auto=true;ctx.continuum=true;ctx.autoTap=true;
  ctx.stoppedMatch={id:'disabled',mode:'arena',started:1,ended:10,captureDone:Promise.resolve(),captureIds:[],heartTimeline:[],variantEvidence:[],reviewFrames:[]};
  await ctx.saveMatchOutcome({matchId:'disabled',outcome:'verloren'});
  assert.equal(ctx.lossStreak,3);assert.equal(ctx.state.auto,true);assert.equal(ctx.autoTap,true);assert.equal(ctx.continuum,true);assert.equal(ctx.lossStopEvent,null);
});


test('loss-stop setting is saved atomically for the next server start',async()=>{
  const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function saveLossGuard('),end=source.indexOf('let autoMode=',start);
  assert.ok(start>=0&&end>start);
  const dir=await mkdtemp(path.join(tmpdir(),'coach-loss-'));
  try{
    const ctx={JSON,Error,writeFile,rename,unlink,stopAfterLosses:true,lossGuardSaving:false,lossGuardFile:path.join(dir,'loss-guard.json')};
    vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
    await ctx.saveLossGuard(false);
    assert.equal(ctx.stopAfterLosses,false);
    assert.deepEqual(JSON.parse(await readFile(ctx.lossGuardFile,'utf8')),{enabled:false});
    await ctx.saveLossGuard(true);
    assert.deepEqual(JSON.parse(await readFile(ctx.lossGuardFile,'utf8')),{enabled:true});
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('opponent moves preserve the known lineup and caption evidence wins over uncertain icons',()=>{
  const card={name:'Maulwurf',position:0,orange:{value:12}};
  assert.deepEqual(mergeEnemyEvent(card,{name:'Maulwurf',action:'add',quantity:3,box:[1,2,3,4]}),{...card,action:'add',quantity:3});
  assert.deepEqual(mergeEnemyEvent(null,{name:'Maulwurf',action:'add',box:[1,2,3,4]}),{name:'Maulwurf',action:'add'});
  assert.equal(preferEnemyDeckCard({name:'Splime',similarity:.9},{name:'Obergeist',similarity:.84,nameSource:'opponent-deck-caption'}),true);
  assert.equal(preferEnemyDeckCard({name:'Obergeist',similarity:.84,nameSource:'opponent-deck-caption'},{name:'Splime',similarity:.95}),false);
});

test('review keeps current image detections separate from earlier opponent evidence',()=>{
  const match={enemyDeck:new Map([[0,{name:'Obergeist',position:0}]]),enemyEvents:new Map(),ownDeckPicks:new Set(['Ritter']),enemyAdditions:new Map(),ownReinforcements:new Map()};
  const raw={enemy:[],own:[{name:'Ritter'}],enemyEvent:{name:'Maulwurf',quantity:3},visionMs:42};
  const item={id:7,phase:'battle_choice',enemy:[{name:'Obergeist'}],own:[],offers:[],ageMs:70,expired:false};
  const frame=makeReviewFrame({started:100,gameLanguage:'en',mode:'arena',captureMs:20},raw,item,match);
  assert.deepEqual(frame.observedInFrame.enemy,[]);
  assert.equal(frame.knownState.enemyDeck[0].name,'Obergeist');
  assert.equal(frame.observedInFrame.enemyEvent.name,'Maulwurf');
  assert.equal(frame.observedInFrame.own[0].name,'Ritter');
  raw.own[0].name='Changed';
  assert.equal(frame.observedInFrame.own[0].name,'Ritter');
  assert.equal(frame.language,'en');
});
test('review evidence is bounded and covers the match',()=>{
  const captureIds=Array.from({length:150},(_,i)=>i+1);
  const game={captureIds,resultCapture:150,reviewFrames:captureIds.map(id=>({id,phase:id<40?'deck_choice':'battle_choice'}))};
  const ids=selectEvidenceIds(game);
  assert.equal(ids.length,80);
  assert.ok(ids.includes(1)&&ids.includes(150)&&ids.some(id=>id>80&&id<145));
});
test('archive saves more than five relevant images with review metadata',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'coach-evidence-'));
  try {
    const runtime=path.join(dir,'runtime');await mkdir(runtime);
    const png=await readFile(new URL('./data/opponent-deck-30830.png',import.meta.url));
    const captureIds=Array.from({length:8},(_,i)=>i+1);
    for(const id of captureIds)await writeFile(path.join(runtime,`capture-${id}.png`),png);
    const game={id:'review-evidence',mode:'arena',outcome:'gewonnen',started:1,ended:10,captureIds,reviewFrames:captureIds.map(id=>({id,phase:'battle_choice',observedInFrame:{enemy:[],own:[]}}))};
    await writeFile(path.join(runtime,'partien.jsonl'),JSON.stringify(game)+'\n');
    await writeFile(path.join(runtime,'antippen.jsonl'),'');
    const file=path.join(dir,'archive.sqlite3');const archive=createArchive(file,runtime);
    await archive.initializeReview();const result=await archive.archiveGames();
    assert.equal(result.images,8);
    const db=new DatabaseSync(file,{readOnly:true});
    try{const row=db.prepare('SELECT details_json FROM partie_protokoll WHERE partie_id=?').get(game.id);assert.equal(JSON.parse(row.details_json).reviewFrames.length,8);}finally{db.close();}
    const reviewed=await archive.review.match(game.id);assert.equal(reviewed.frames.length,8);
    assert.deepEqual(await archive.review.image(reviewed,3),png);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('general Astra questions include saved observations in both languages',()=>{
  const rules=[{offer:'Astra',enemy:'',weight:0,status:'notiz',title:'Astra braucht Masse',reason:'Viele Astra brauchen Schutz.',texts:{de:{title:'Astra braucht Masse',reason:'Viele Astra brauchen Schutz.'},en:{title:'Astra needs numbers',reason:'Many Astra need protection.'}}},{offer:'Schildling',enemy:'Astra',weight:0,status:'notiz',title:'Schildling gegen Astra',reason:'Nur im Nahkampf.'}];
  for(const lang of ['de','en']){
    const result=quickAdvice('Astra?', ['Astra','Schildling'],rules,[],[],lang);
    assert.equal(result.entries.length,2);assert.equal(result.entries[0].status,'notiz');
    assert.match(result.summary,lang==='de'?/Hinweise/:/information/);
  }
  const counter=quickAdvice('Was hilft gegen Astra?', ['Astra','Schildling'],rules,[],[],'de');
  assert.equal(counter.entries[0].status,'notiz');assert.match(counter.entries[0].detail,/Nahkampf/);
});
test('optional AI web search returns validated source citations',async()=>{
  const answer=await answerTactics({key:'test',model:'test',language:'de',question:'Astra?',knowledge:{},webSearch:true},async(url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.tools[0].type,'web_search');
    return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Eine Beobachtung.',annotations:[{type:'url_citation',url:'https://example.org/astra',title:'Quelle',end_index:18},{type:'url_citation',url:'javascript:alert(1)',end_index:18}]}]}]})};
  });
  assert.equal(answer.summary,'Eine Beobachtung.');assert.equal(answer.citations.length,1);assert.equal(answer.citations[0].url,'https://example.org/astra');
});

test('weighted notes apply weakly only where active rules do not supersede them',()=>{
  const result={phase:'battle_choice',enemy:[{name:'Agent B'}],offers:[{name:'Ritter',action:'add',quantity:2}]};
  const note={title:'unconfirmed',reason:'maybe',offer:'Ritter',enemy:'Agent B',mode:'beide',phase:'alle',status:'notiz',weight:12};
  const score=rules=>recommend(result,'arena',collection,db,false,rules).evaluated[0];
  assert.equal(score([note]).delta,4);
  assert.equal(score([{...note,weight:0}]).delta,0);
  const active={...note,title:'confirmed',status:'aktiv',weight:-7};
  assert.equal(score([note,active]).delta,-7);
  assert.ok(score([note]).reason.includes('Unbestätigte'));
});
test('research extraction requests constrained bilingual facts',async()=>{
 const facts=await extractResearchFacts({key:'test',model:'test',summary:'An observation',sources:['https://example.org/a'],cards:['Ritter']},async(url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.text.format.type,'json_schema');
  return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({facts:[{title_de:'Ritter',title_en:'Knight',reason_de:'Beobachtung',reason_en:'Observation',offer:'Ritter',enemy:'',source:'https://example.org/a',weight:1}]})}]}]})};
 });assert.equal(facts[0].offer,'Ritter');assert.equal(facts[0].source,'https://example.org/a');
});

test('Astra note needs a developed enemy and no observed allied support',()=>{
  const rule={title:'Astra threatened',reason:'needs support',offer:'Astra',enemy:'Agent B',mode:'beide',phase:'battle_choice',status:'notiz',weight:-3,condition:'enemy_developed_no_observed_support'};
  const base={phase:'battle_choice',offers:[{name:'Astra',action:'add',quantity:2}],enemy:[{name:'Agent B',action:'upgrade'}],ownReinforcements:{Astra:4}};
  const score=x=>recommend(x,'arena',collection,db,false,[rule]).evaluated[0].delta;
  assert.equal(score(base),-3);
  assert.equal(score({...base,enemy:[{name:'Agent B',action:'add'}]}),0);
  assert.equal(score({...base,ownReinforcements:{Astra:4,'Agent B':2}}),0);
  assert.equal(score({...base,ownReinforcements:{}}),0);
});

test('Splime enters draft pool only after two distinct normal caption windows',()=>{
 const tracker={seen:new Set(),windows:new Set(),counts:new Map(),confirmed:false};
 const owned=new Set(['Astra','Schnecke','Agent B','Splime']);
 const card=(name,position)=>({name,position,nameSource:'Kartenbeschriftung',similarity:name==='Splime'?.859:.9,captionMargin:name==='Splime'?.081:.2,action:'add',quantity:name==='Splime'?4:2});
 const frame=names=>({phase:'battle_choice',deckEvidence:true,offers:names.map(card)});
 observeDraftLineup(tracker,frame(['Astra','Schnecke','Agent B']),owned);
 const one=frame(['Agent B','Schnecke','Splime']);
 observeDraftLineup(tracker,one,owned);observeDraftLineup(tracker,one,owned);
 assert.equal(tracker.seen.has('Splime'),false);
 observeDraftLineup(tracker,{...one,deckEvidence:false,offers:['Agent B','Splime','Schnecke'].map(card)},owned);
 assert.equal(tracker.seen.has('Splime'),false);
 observeDraftLineup(tracker,frame(['Agent B','Splime','Schnecke']),owned);
 assert.equal(tracker.seen.has('Splime'),true);
 const lineup=observeDraftLineup(tracker,frame(['Astra','Agent B','Schnecke']),owned);
 assert.deepEqual(new Set(lineup),owned);
 const weak={seen:new Set(),windows:new Set(),counts:new Map(),confirmed:false};
 for(const names of [['Agent B','Schnecke','Splime'],['Agent B','Splime','Schnecke']]){
   const f=frame(names);f.offers.find(x=>x.name==='Splime').captionMargin=.071;observeDraftLineup(weak,f,owned);
 }
 assert.equal(weak.seen.has('Splime'),false);
});

test('standalone build identity is stamped, version-specific and never guessed',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'coach-build-'));
 try{
  assert.equal(await resolveBuild(dir,'0.7.0-beta'),null);
  await mkdir(path.join(dir,'runtime'));
  await writeFile(path.join(dir,'runtime','build-info.json'),JSON.stringify({version:'0.7.0-beta',number:112,commit:'abcdef123456'}));
  assert.deepEqual(await resolveBuild(dir,'0.7.0-beta'),{number:112,commit:'abcdef123456',dirty:false,source:'stamp',differences:[]});
  assert.equal(await resolveBuild(dir,'0.8.0-beta'),null);
  await writeFile(path.join(dir,'runtime','build-info.json'),JSON.stringify({version:'0.7.0-beta',number:112,commit:'abcdef123456',dirty:true,differences:['vision.py']}));
  assert.deepEqual((await resolveBuild(dir,'0.7.0-beta')).differences,['vision.py']);
  assert.equal((await resolveBuild(dir,'0.7.0-beta')).dirty,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('build Agent B early against an observed enemy Snail without overprioritizing after four',()=>{
 const frame={phase:'battle_choice',enemy:[{name:'Schnecke'},{name:'Ritter'},{name:'Splime'}],ownReinforcements:{Kupid:3,Merlinor:1},offers:[{name:'Agent B',action:'add',quantity:2},{name:'Kupid',action:'add',quantity:3},{name:'Merlinor',action:'add',quantity:1}]};
 const early=recommend(frame,'arena',collection,db);assert.equal(early.best.name,'Agent B');
 const later=recommend({...frame,ownReinforcements:{...frame.ownReinforcements,'Agent B':4}},'arena',collection,db);
 assert.ok(early.evaluated[0].score>later.evaluated[0].score);
 const noSnail=recommend({...frame,enemy:[{name:'Ritter'}]},'arena',collection,db);assert.ok(early.evaluated[0].score>noSnail.evaluated[0].score);
});

test('developed enemy Agent B reduces Snail reinforcement without assuming an unknown build-up',()=>{
 const frame={phase:'battle_choice',enemy:[{name:'Agent B',action:'upgrade'}],offers:[{name:'Schnecke',action:'add',quantity:1},{name:'Agent B',action:'add',quantity:2},{name:'Sniper',action:'add',quantity:2}]};
 const get=x=>recommend(x,'arena',collection,db).evaluated[0];
 const developed=get(frame);const basic=get({...frame,enemy:[{name:'Agent B',action:'add'}]});
 assert.equal(basic.score-developed.score,18);
 assert.match(developed.reason,/Schnecke zurückstellen/);
 assert.equal(get({...frame,enemy:[{name:'Agent B',action:'add'}],enemyAdditions:{'Agent B':4}}).score,developed.score);
});
