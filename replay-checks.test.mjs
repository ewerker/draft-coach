import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {DatabaseSync,backup} from 'node:sqlite';
import {mechanicsRegression,compareConfirmedImage,replayAudit,createReplayChecksStore,replayChecksSchema,replayFingerprint} from './replay-checks.mjs';
import {createArchive} from './archive.mjs';
const collection=JSON.parse(await readFile(new URL('./data/sample-collection.json',import.meta.url))),matchups=JSON.parse(await readFile(new URL('./data/matchups.json',import.meta.url)));
const frame={id:1,phase:'battle_choice',language:'en',versions:{collection:'historical'},offers:[{name:'Assassine',position:0,action:'add',quantity:3},{name:'Spartheus',position:1,action:'add',quantity:3},{name:'Sniper',position:2,action:'add',quantity:2}],enemy:[{name:'Merlinor'}]};
test('independent mechanic numbers fail closed when the calculator regresses',()=>{
 assert.ok(mechanicsRegression().every(t=>t.status==='passed'));
 assert.ok(mechanicsRegression(()=>({known:true,afterTotal:24,affectedCount:12,after:{units:[{forms:[]}]}})).some(t=>t.status==='contradicted'));
});
test('confirmed image mismatches are distinct from unconfirmed hints and lower-bound counts',()=>{
 const ref={id:'ref',reviewAssisted:true,fieldConfirmations:{enemy:{actor:'player',typesComplete:true,groups:[{name:'Königlop',typeConfirmed:true,count:2}]}}};
 const missing=compareConfirmedImage(frame,ref)[0];assert.equal(missing.status,'contradicted');assert.deepEqual(missing.missing,['Königlop']);assert.equal(missing.assisted,true);
 const partial={...frame,armyObservation:{sides:{enemy:{groups:[{name:'Königlop',visibleMinimum:1,visibleMaximum:null}]}}}};
 const unknown=compareConfirmedImage(partial,ref)[0];assert.equal(unknown.counts[0].status,'unclear');assert.equal(unknown.status,'unclear');
 ref.fieldConfirmations.enemy.actor='Codex';assert.equal(compareConfirmedImage(frame,ref).length,0);
});
test('replays compare versioned structured rules without treating changed choices or a win as tactical proof',async()=>{
 const rule={id:'candidate',status:'test',offer:'Spartheus',enemy:'Merlinor',weight:25,mode:'beide',phase:'battle_choice',texts:{de:{title:'Beispiel'},en:{title:'Example'}}};
 const input={game:{id:'g',mode:'arena',language:'en',outcome:'gewonnen',reviewFrames:[frame]},rules:[rule],collectionFor:async()=>collection,matchups,engine:'fixture'};
 const report=await replayAudit(input);assert.equal(report.rules[0].eligible,1);assert.equal(report.rules[0].status,'replayed');assert.equal(report.counts.unclear,1);assert.equal(report.automaticActivation,false);assert.equal(report.tacticalEffect,'not_established');assert.deepEqual(report.coverage,{de:0,en:1});
 const absent=await replayAudit({...input,collectionFor:async()=>null});assert.ok(absent.basis[0].missing.includes('historical_collection'));assert.equal(absent.rules[0].eligible,0);
 const failed=await replayAudit({...input,calculate:()=>({known:false})});assert.equal(failed.blocked,true);assert.equal(failed.rules[0].status,'blocked_by_mechanics');
 await assert.rejects(replayAudit({...input,guard:()=>{throw Error('PLAY_STARTED');}}),/PLAY_STARTED/);
});
test('replay reports are idempotent, versioned and survive restart and full SQLite backup',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'coach-replay-checks-')),file=path.join(dir,'db.sqlite');
 try{const archive=createArchive(file,path.join(dir,'runtime'));await archive.initializeReview();const input={game:{id:'g',mode:'arena',language:'de',outcome:'verloren',reviewFrames:[frame]},rules:[],collectionFor:async()=>collection,matchups,engine:'1'};
 const report=await replayAudit(input),fingerprint=replayFingerprint(input.game);await archive.replayChecks.save(fingerprint,report);await archive.replayChecks.save(fingerprint,report);assert.equal((await archive.replayChecks.list()).length,1);
 const db=new DatabaseSync(file);await backup(db,path.join(dir,'backup.sqlite'));db.close();
 const withDb=async(_,fn)=>{const d=new DatabaseSync(path.join(dir,'backup.sqlite'));try{return await fn(d);}finally{d.close();}};
 const restored=createReplayChecksStore(withDb);assert.equal(await restored.has(fingerprint),true);assert.equal((await restored.list())[0].data.matchId,'g');assert.notEqual(replayFingerprint({...input.game,language:'en'}),fingerprint);
 }finally{await rm(dir,{recursive:true,force:true});}
});
