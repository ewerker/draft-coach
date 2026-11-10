import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildFieldEvaluation,fieldReadiness} from './field-learning.mjs';
import {createReferenceStore} from './reference-store.mjs';

test('separates matches, excludes unlinked and incomplete images from evaluation',()=>{
  const refs=Array.from({length:12},(_,i)=>({id:String(i),matchId:'match-'+Math.floor(i/2),complete:{enemy:i%2===0},corrections:[{phase:'enemy_field',position:0,name:'A',box:[1,2,3,4]}]}));
  refs.push({id:'unknown',corrections:[{phase:'enemy_field',name:'A'}],complete:{enemy:true}});
  const p=buildFieldEvaluation(refs,id=>id);
  const training=new Set(p.examples.map(e=>refs.find(r=>r.id===e.path).matchId));
  assert.ok(p.cases.length);assert.ok(p.examples.length);
  for(const item of p.cases)assert.ok(!training.has(item.matchId));
  assert.ok(!p.examples.some(e=>e.path==='unknown'));assert.ok(!p.cases.some(e=>e.id==='unknown'));
  assert.equal(p.inventory.unlinkedImages,1);
  const more=buildFieldEvaluation([...refs,{id:'new',matchId:'new-match',complete:{enemy:true},corrections:[{phase:'enemy_field',name:'B'}]}],id=>id);
  for(const item of p.cases)assert.ok(more.cases.some(next=>next.id===item.id));
  assert.notEqual(p.fingerprint,buildFieldEvaluation(refs,id=>id,'new-engine').fingerprint);
});

test('readiness requires independent coverage, precision, recall and no errors',()=>{
  const valid={images:30,matches:5,precision:.95,recall:.90,errors:0,types:{A:{tp:1,fn:0},B:{tp:1,fn:0},C:{tp:1,fn:0}}};
  assert.equal(fieldReadiness(valid).ready,true);
  for(const changed of [{images:29},{matches:4},{precision:.94},{recall:.89},{errors:1}])assert.equal(fieldReadiness({...valid,...changed}).ready,false);
  assert.equal(fieldReadiness(null).ready,false);
  assert.equal(fieldReadiness({...valid,types:{A:{tp:1,fn:0}}}).ready,false);
});

test('editing an annotation withdraws completeness; obsolete rows can be removed',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'coach-field-'));
  try{
    const store=await createReferenceStore(dir),ref=await store.add(Buffer.from('png'),{matchId:'game'});
    const correction={phase:'own_field',position:0,name:'A',box:[1,2,3,4]};
    assert.equal((await store.setComplete(ref.id,'own',true)).complete.own,true);
    await store.correct(ref.id,correction);await store.setComplete(ref.id,'own',true);
    assert.equal((await store.correct(ref.id,correction)).complete.own,false);
    await store.correct(ref.id,{...correction,position:1,name:'B'});
    const item=await store.keepFieldPositions(ref.id,'own',[1]);
    assert.deepEqual(item.corrections.map(c=>c.name),['B']);assert.equal(item.complete.own,false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
