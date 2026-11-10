import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync,backup} from 'node:sqlite';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {calculateFormEffect,createFormMechanicsStore,formMechanicsSchema,defaultMechanisms,validateMechanism} from './form-mechanics.mjs';
const forms=[{id:'base',unit:'Merlinor'},{id:'grown',unit:'Merlinor'}];
const inventory={actor:'player',side:'own',matchId:'game',captureId:1,units:[{name:'Merlinor',cardLevel:12,stars:5,totalCount:12,forms:[{formId:'base',count:2},{formId:'grown',count:10}]}]};
const binding={confirmed:true,scopeConfirmed:true,actor:'player',sourceFormId:'base',targetFormId:'grown'};
const run=(action,extra={})=>calculateFormEffect({offer:{name:'Merlinor',action,quantity:action==='multiply'?2:undefined},inventory,binding,forms,matchId:'game',captureId:1,...extra});

test('A5: doubling and upgrading affect only two source units, leaving ten evolved units alone',()=>{
 const doubled=run('multiply');assert.equal(doubled.known,true);assert.equal(doubled.affectedCount,2);assert.equal(doubled.afterTotal,14);assert.deepEqual(doubled.after.units[0].forms,[{formId:'base',count:4},{formId:'grown',count:10}]);
 const upgraded=run('upgrade');assert.equal(upgraded.afterTotal,12);assert.deepEqual(upgraded.after.units[0].forms,[{formId:'base',count:0},{formId:'grown',count:12}]);
 assert.equal(inventory.units[0].forms[0].count,2);assert.equal(upgraded.after.units[0].cardLevel,12);assert.equal(upgraded.after.units[0].stars,5);assert.equal(upgraded.expectedOnly,true);
});
test('combined effects require explicit confirmed meaning; conflicts and unknown forms block exact claims',()=>{
 assert.equal(run('multiply_upgrade').reason,'unconfirmed_mechanism');
 const known=defaultMechanisms.map(m=>m.action==='multiply_upgrade'?{...m,status:'confirmed',evidence:'Independent before/after case'}:m);
 const out=run('multiply_upgrade',{mechanisms:known});assert.equal(out.affectedCount,2);assert.equal(out.afterTotal,14);assert.equal(out.after.units[0].forms[1].count,14);
 assert.equal(run('multiply_upgrade',{mechanisms:known.map(m=>m.action==='multiply_upgrade'?{...m,status:'conflict'}:m)}).reason,'conflicting_mechanism');
 assert.equal(run('upgrade',{binding:{...binding,confirmed:false}}).known,false);
 assert.equal(run('upgrade',{binding:{...binding,sourceFormId:'unknown'}}).known,false);
 assert.equal(run('upgrade',{captureId:2}).known,false);assert.equal(run('upgrade',{matchId:'other'}).known,false);
});
test('a total count or card level cannot replace unknown source-form counts',()=>{
 const unknown=structuredClone(inventory);unknown.units[0].forms[0].count=null;
 assert.equal(run('upgrade',{inventory:unknown}).reason,'unknown_source_count');
 const conflict=structuredClone(inventory);conflict.units[0].forms[0].count=5;
 assert.equal(run('upgrade',{inventory:conflict}).reason,'conflicting_counts');
 const partial=structuredClone(inventory);partial.units[0].totalCount=null;
 const result=run('multiply',{inventory:partial});assert.equal(result.affectedCount,2);assert.equal(result.afterTotal,null);
 const malformed=structuredClone(inventory);malformed.units[0].forms.push({formId:'base',count:2});assert.equal(run('upgrade',{inventory:malformed}).known,false);
 const unassigned=structuredClone(inventory);unassigned.units[0].forms=[{formId:'base',count:2}];
 const transfer=run('upgrade',{inventory:unassigned});assert.equal(transfer.affectedCount,2);assert.equal(transfer.afterTotal,12);assert.equal(transfer.after.units[0].forms.find(f=>f.formId==='grown').count,null,'an unlisted target may already exist among unassigned units');
});
test('mechanisms are bounded structured operations, never executable expressions',()=>{
 assert.throws(()=>validateMechanism({unit:'*',action:'eval',scope:'source_only',status:'confirmed',evidence:'x'},forms));
 assert.throws(()=>validateMechanism({unit:'*',action:'upgrade',scope:'source_only',status:'confirmed',evidence:'x',code:'process.exit()'},forms));
 assert.throws(()=>validateMechanism({unit:'*',action:'multiply',scope:'whole_army',status:'confirmed',evidence:'x'},forms));
 assert.throws(()=>validateMechanism({unit:'Merlinor',action:'upgrade',scope:'source_only',status:'confirmed',evidence:'x',sourceFormId:'base',targetFormId:'missing'},forms));
});
test('player-described forms keep stable IDs across relabelling, language aliases, restart and SQLite backup',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'coach-forms-'));const file=path.join(dir,'forms.sqlite');const db=new DatabaseSync(file);db.exec(formMechanicsSchema);db.close();
 const connection=file=>async(_,fn)=>{const db=new DatabaseSync(file);try{return await fn(db);}finally{db.close();}};
 try{
  let store=createFormMechanicsStore(connection(file));
  const ref={id:'reference',matchId:'game',captureId:1,fieldConfirmations:{own:{actor:'player',questionId:'q',revision:1,typesComplete:true,groups:[{name:'Merlinor',typeConfirmed:true,count:12,forms:[{label:'Sternhut',language:'de',confirmed:true,count:2},{label:'Halbmondhut',language:'de',confirmed:true,count:10}]}]}}};
  await store.syncReferences([ref]);let all=await store.list();assert.equal(all.forms.length,2);const f=all.forms.find(f=>f.labels.de==='Sternhut');
  await store.updateForm({id:f.id,revision:f.revision,labels:{de:'Hut mit Stern',en:'Star hat'}});await store.syncReferences([ref]);all=await store.list();assert.equal(all.forms.length,2);assert.equal(all.forms.find(x=>x.id===f.id).labels.en,'Star hat');
  const next=structuredClone(ref);next.id='english-ref';next.captureId=2;next.fieldConfirmations.own.groups[0].forms=[{label:'Star hat',language:'en',confirmed:true,count:2}];await store.syncReferences([ref,next]);assert.equal((await store.list()).forms.length,2);
  const snapshot=await store.context('game',1);assert.equal(snapshot.formInventory.units[0].forms.length,2);
  await store.bind({matchId:'game',capture:1,position:0,sourceFormId:f.id,targetFormId:f.id,confirmed:true});
  await store.recordMechanism({id:'source-only-multiply_upgrade',revision:1,unit:'*',action:'multiply_upgrade',scope:'source_only',status:'conflict',evidence:'Conflicting observations'});
  await assert.rejects(store.recordMechanism({id:'source-only-multiply_upgrade',revision:1,unit:'*',action:'multiply_upgrade',scope:'source_only',status:'confirmed',evidence:'stale'}),/MECHANISM_CHANGED/);
  const source=new DatabaseSync(file);await backup(source,path.join(dir,'restored.sqlite'));source.close();store=createFormMechanicsStore(connection(path.join(dir,'restored.sqlite')));
  assert.equal((await store.context('game',1)).formBindings[0].sourceFormId,f.id);assert.equal((await store.list()).mechanisms.find(m=>m.action==='multiply_upgrade').status,'conflict');
  await store.syncReferences([]);assert.equal((await store.list()).inventories.length,0);assert.equal((await store.list()).forms.length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
