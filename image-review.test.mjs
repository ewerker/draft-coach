import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createImageReviewStore,imageReviewSchema,validateImageAnswer,fieldPartition,selectImageQuestions} from './image-review.mjs';
import {createReferenceStore} from './reference-store.mjs';
import {buildFieldEvaluation} from './field-learning.mjs';
const names=new Set(['Sniper','Agent B','Spartheus','Schnecke','Astra']);
const row=(name='Sniper')=>({name,typeConfirmed:true,count:9,countConfirmed:false,forms:[],box:[30,1600,100,1700]});
const answer=(side='own')=>({language:'en',sides:{[side]:{verdict:'partial',groups:[row()],typesComplete:false}}});

test('only explicit confirmations become truth; mixed forms and partial/empty sides stay distinct',()=>{
 const value=answer();value.sides.own.groups[0].forms=Array.from({length:6},(_,i)=>({label:'Appearance '+i,confirmed:true,count:8,countConfirmed:false}));
 const validated=validateImageAnswer(value,names);
 assert.equal(validated.sides.own.groups[0].count,null);assert.equal(validated.sides.own.groups[0].forms.length,6);
 assert.ok(validated.sides.own.groups[0].forms.every(f=>f.count===null));assert.equal(validated.sides.enemy,undefined);
 assert.equal(validated.sides.own.typesComplete,false);
 assert.throws(()=>validateImageAnswer({sides:{own:{verdict:'yes',groups:[],typesComplete:true}}},names),/CONFIRM_EMPTY/);
 assert.equal(validateImageAnswer({sides:{own:{verdict:'yes',groups:[],typesComplete:true,emptyConfirmed:true}}},names).sides.own.emptyConfirmed,true);
 assert.throws(()=>validateImageAnswer({sides:{own:{verdict:'unassessable',groups:[row()]}}},names));
 const missing=answer();missing.sides.own.groups[0].typeConfirmed=false;assert.throws(()=>validateImageAnswer(missing,names),/CONFIRM_UNIT_TYPE/);
 const bad=answer();bad.sides.own.groups[0].countConfirmed=true;bad.sides.own.groups[0].count=0;assert.throws(()=>validateImageAnswer(bad,names),/INVALID_UNIT_COUNT/);
 const box=answer();box.sides.own.groups[0].box=[1,20,30,60];assert.throws(()=>validateImageAnswer(box,names),/INVALID_EXAMPLE_BOX/);
});

test('persistent queue, blinded controls, optimistic locking and resumable projection',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'coach-image-review-'));
 const file=path.join(dir,'db.sqlite');
 const db=new DatabaseSync(file);db.exec(imageReviewSchema);db.close();
 const withDb=async(_,fn)=>{const db=new DatabaseSync(file);try{return await fn(db);}finally{db.close();}};
 try{
  let store=createImageReviewStore(withDb);
  const game={id:'match-0',language:'en'},frame={id:1,phase:'battle_choice',armyObservation:{sides:{enemy:{groups:[{name:'Agent B',visibleMinimum:8}]}}}};
  const id=await store.add(game,frame,Buffer.from('png'),'control');
  await store.add(game,frame,Buffer.from('png'),'targeted');assert.equal((await store.list()).items.length,1);
  assert.deepEqual((await store.get(id)).context.proposals,{});assert.equal((await store.get(id,false)).context.proposals.enemy.groups[0].name,'Agent B');
  await store.answer(id,0,answer(),names);assert.equal(await store.pending(),id);
  store=createImageReviewStore(withDb);const saved=await store.get(id);assert.equal(saved.revision,1);assert.equal(saved.answer.sides.own.groups[0].count,null);
  assert.equal((await store.list()).counts.partial,1);assert.equal((await store.list()).counts.open,1);
  await assert.rejects(store.answer(id,0,answer(),names),/IMAGE_QUESTION_CHANGED/);
  const refs=await createReferenceStore(path.join(dir,'refs'));const ref=await refs.add(await store.image(id),{matchId:game.id,captureId:1});
  await refs.correct(ref.id,{name:'Astra',phase:'enemy_field',position:0,box:[40,400,100,470]});
  await refs.confirmField(ref.id,saved);await store.projected(id,1,ref.id);
  assert.equal(await store.pending(),null);assert.equal((await refs.list())[0].corrections[0].name,'Astra');
  const combined={language:'de',sides:{...saved.answer.sides,enemy:{verdict:'unassessable',groups:[]}}};
  await store.answer(id,1,combined,names);assert.equal((await store.list()).counts.open,0);
  // Export restarts safely and cannot mark a newer answer as done.
  await store.projected(id,1,ref.id);assert.equal(await store.pending(),id);
  await refs.confirmField(ref.id,await store.get(id,false));await store.projected(id,2,ref.id);
  const updated=(await refs.list())[0];assert.equal(updated.corrections[0].name,'Astra');assert.equal(updated.fieldConfirmations.own.actor,'player');
  await refs.correct(ref.id,{name:'Schnecke',phase:'own_field',position:0,box:[40,1600,100,1670]});assert.equal((await refs.list())[0].fieldConfirmations.own,undefined);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('stable whole-match holdout, hash leakage prevention, complete empty cases and partial training',()=>{
 const train=Array.from({length:20},(_,i)=>'g'+i).find(id=>fieldPartition(id)==='training');
 const hold=Array.from({length:20},(_,i)=>'g'+i).find(id=>fieldPartition(id)==='test');
 const confirmed={verdict:'partial',typesComplete:false,groups:[{...row(),count:null}]};
 const refs=[{id:'a',matchId:train,imageHash:'a',fieldConfirmations:{own:confirmed}},
  {id:'b',matchId:hold,imageHash:'b',reviewPurpose:'control',fieldConfirmations:{enemy:{typesComplete:true,emptyConfirmed:true,groups:[]}}},
  {id:'c',matchId:train,imageHash:'b',corrections:[{...row(),phase:'own_field'}]}];
 const plan=buildFieldEvaluation(refs,id=>id);assert.equal(plan.examples.length,1);assert.equal(plan.examples[0].referenceId,'a');
 assert.equal(plan.cases.length,1);assert.deepEqual(plan.cases[0].truth,[]);assert.equal(plan.cases[0].reviewPurpose,'control');
 assert.ok(!plan.examples.some(e=>e.matchId===hold));
 refs[0].fieldConfirmations.own.groups[0].box=null;assert.equal(buildFieldEvaluation(refs,id=>id).examples.length,0);
});

test('few diverse images include deterministic confidence-independent control and early/late candidates',()=>{
 const frames=Array.from({length:30},(_,i)=>({id:i,phase:'battle_choice',language:'en',geometry:{layout:'full'}}));
 const game={id:'g',reviewFrames:frames};const selected=selectImageQuestions(game);
 assert.equal(selected.length,3);assert.equal(selected[0].purpose,'control');assert.equal(new Set(selected.map(s=>s.frame.id)).size,3);
 const changed=structuredClone(game);changed.reviewFrames.forEach(f=>f.armyObservation={sides:{own:{groups:[{name:'Astra'}]}}});
 assert.equal(selectImageQuestions(changed)[0].frame.id,selected[0].frame.id);
 assert.ok(selected.some(s=>s.frame.id===0));
});
