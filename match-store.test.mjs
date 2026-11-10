import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createArchive} from './archive.mjs';
import {snapshotMatch,restoreMatch,createMatchStore,createJobRunner} from './match-store.mjs';
import {nextLossStreak} from './pipeline.mjs';
import {persistenceLabels} from './public/persistence.mjs';

function match(id='test-match'){
  return {id,started:1,mode:'draft',language:'en',device:'test-only',captureIds:[11,12],
    enemyDeck:new Map([[0,{name:'Schnecke'}]]),enemyEvents:new Map(),enemyAdditions:new Map([['Schnecke',2]]),
    ownDeckPicks:new Set(['Agent B']),ownReinforcements:new Map([['Agent B',4]]),ownVariantUncertain:new Set(),
    pendingReinforcement:{choice:'old',offer:{name:'Agent B'}},captureDone:Promise.resolve(),
    draftObservation:{seen:new Set(['Astra']),counts:new Map([['Astra',2]]),windows:new Set(['one'])},
    reviewFrames:[{id:11,offers:[{name:'Agent B',action:'add',quantity:2}],versions:{program:'v',tactics:'r'}}],
    versions:{program:'version',tactics:'rules'},lineup:{units:['Agent B'],spells:[]}};
}
async function fixture(){
  const dir=await mkdtemp(path.join(tmpdir(),'coach-p2-')),runtime=path.join(dir,'runtime');await mkdir(runtime);
  const file=path.join(dir,'test.sqlite3'),archive=createArchive(file,runtime);await archive.initializeReview();
  return {dir,runtime,file,archive,close:()=>rm(dir,{recursive:true,force:true})};
}

test('a checkpoint survives a process restart with Maps, Sets, IDs and unknown outcome, without replaying an old tap',async()=>{
  const f=await fixture();
  try{
    const original=match();await f.archive.runs.checkpoint(original);
    const restarted=createArchive(f.file,f.runtime);await restarted.initializeReview();
    const recovered=await restarted.runs.recover();assert.equal(recovered.length,1);assert.equal(recovered[0].id,original.id);
    const row=await restarted.runs.read(original.id);assert.equal(row.status,'interrupted');assert.equal(row.outcome,null);
    assert.equal(row.match.enemyDeck.get(0).name,'Schnecke');assert.equal(row.match.ownReinforcements.get('Agent B'),4);
    assert.ok(row.match.draftObservation.seen.has('Astra'));assert.equal(row.match.pendingReinforcement,null);
    assert.equal(row.match.captureDone,undefined);assert.equal(restoreMatch(snapshotMatch(original)).id,original.id);
    const games=await restarted.review.matches();assert.equal(games[0].outcome,'unbekannt');assert.equal(games[0].runStatus,'interrupted');
    assert.equal(nextLossStreak(2,games[0].outcome),2);
    assert.equal((await restarted.runs.jobs()).length,0);
  }finally{await f.close();}
});

test('a completed result and both background jobs are committed exactly once, even after a late checkpoint',async()=>{
  const f=await fixture();
  try{
    const game=match();await f.archive.runs.checkpoint(game);
    assert.equal((await f.archive.runs.complete({...game,ended:10},'gewonnen')).created,true);
    assert.equal((await f.archive.runs.complete({...game,ended:99},'gewonnen')).created,false);
    await assert.rejects(f.archive.runs.complete(game,'verloren'),/anderes Ergebnis/);
    await f.archive.runs.checkpoint(game,'paused');await f.archive.runs.recover();
    assert.equal((await f.archive.runs.recoverable()).length,0);assert.equal((await f.archive.runs.jobs()).length,2);
    const games=await f.archive.review.matches();assert.equal(games.length,1);assert.equal(games[0].outcome,'gewonnen');assert.equal(games[0].ended,10);
    assert.equal((await f.archive.status()).games,1);
  }finally{await f.close();}
});

test('jobs pause during play, survive interruption, retry only three times and support an explicit retry',async()=>{
  const f=await fixture();
  try{
    let at=100,busy=true,calls=0;
    const withDb=async(_read,fn)=>{const db=new DatabaseSync(f.file);try{return await fn(db);}finally{db.close();}};
    const store=createMatchStore(withDb,{now:()=>at});await store.complete({...match(),ended:10},'verloren');
    const runner=createJobRunner(store,{busy:()=>busy,handlers:{archive:async()=>{calls++;throw Error('Simulated disk error');}}});
    await runner.tick();assert.equal(calls,0);assert.equal((await store.jobs()).find(j=>j.kind==='archive').attempts,0);
    busy=false;for(let i=0;i<3;i++){await runner.tick();at+=100000;}
    let job=(await store.jobs()).find(j=>j.kind==='archive');assert.equal(job.status,'failed');assert.equal(job.attempts,3);
    await runner.tick();assert.equal(calls,3);await store.retry(job.id);
    const claimed=await store.claim();assert.equal(claimed.attempts,1);
    await store.recover();job=(await store.jobs()).find(j=>j.kind==='archive');assert.equal(job.status,'pending');
    assert.equal(job.error,'PROCESS_RESTARTED');
    const successful=createJobRunner(store,{busy:()=>false,handlers:{archive:async()=>({images:0}),prepare_review:async job=>store.report(job.match_id)}});
    await successful.tick();await successful.tick();assert.ok((await store.jobs()).every(j=>j.status==='done'));
  }finally{await f.close();}
});

test('play starting during a background task defers it without consuming a failure attempt',async()=>{
  const f=await fixture();
  try{
    await f.archive.runs.complete({...match(),ended:10},'unbekannt');let busy=false;
    const runner=createJobRunner(f.archive.runs,{busy:()=>busy,handlers:{archive:async(_job,guard)=>{busy=true;guard();}}});
    await runner.tick();const job=(await f.archive.runs.jobs()).find(j=>j.kind==='archive');assert.equal(job.status,'pending');assert.equal(job.attempts,0);
  }finally{await f.close();}
});

test('sent taps, manual browser actions and screen transitions remain separate from verified actual choices',async()=>{
  const f=await fixture();
  try{
    await f.archive.runs.checkpoint(match());
    await f.archive.runs.action('test-match',{aufnahme:11,art:'automatisch',ergebnis:'gesendet',karte:'Agent B',offerSignature:JSON.stringify([['Agent B','add',2]])});
    await f.archive.runs.observeTransition('test-match',12,{phase:'battle_choice',offers:[{name:'Agent B',action:'add',quantity:2}]});
    assert.equal((await f.archive.runs.actions('test-match'))[0].evidenceStatus,'sent');
    await f.archive.runs.observeTransition('test-match',13,{phase:'battle',offers:[]});
    const action=(await f.archive.runs.actions('test-match'))[0];assert.equal(action.evidenceStatus,'transition_observed');assert.equal(action.actualChoice,'unverified');
    await f.archive.runs.action('test-match',{aufnahme:12,art:'bildklick',ergebnis:'gesendet',karte:'Astra'});
    await f.archive.runs.complete({...match(),ended:10},'verloren');const report=await f.archive.runs.report('test-match');
    assert.equal(report.sentActions,2);assert.equal(report.manualBrowserActions,1);assert.equal(report.transitionsObserved,1);assert.equal(report.actualPhoneChoices,'not_verified');
    assert.equal(report.tacticalEffect,'not_tested');
  }finally{await f.close();}
});

test('duplicate images share one binary asset, budgets skip only new images, and review still reads both captures',async()=>{
  const f=await fixture();
  try{
    const png=await readFile(new URL('./data/opponent-deck-30830.png',import.meta.url));
    const game=match();await f.archive.runs.checkpoint(game);
    const tiny={perMatch:80,perMatchBytes:png.length,totalNewBytes:png.length};
    assert.equal((await f.archive.runs.storeImages(game.id,[{id:11,png},{id:12,png}],tiny)).added,2);
    const altered=Buffer.concat([png,Buffer.from('changed')]);
    assert.equal((await f.archive.runs.storeImages(game.id,[{id:13,png:altered}],tiny)).skipped,1);
    assert.equal((await f.archive.runs.imageStatus()).assets,1);
    await f.archive.runs.complete({...game,ended:10},'gewonnen');await f.archive.archiveGames(game.id);
    const review=await f.archive.review.match(game.id);assert.equal(review.availableCaptureIds.length,2);assert.deepEqual(await f.archive.review.image(review,12),png);
    const again=await f.archive.archiveGames(game.id);assert.equal(again.images,0);
    const db=new DatabaseSync(f.file);try{assert.equal(db.prepare('SELECT sum(length(bild)) AS n FROM belege').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM partien').get().n,1);}finally{db.close();}
  }finally{await f.close();}
});

test('versions are immutable and content-addressed, capture numbering survives raw-image cleanup, labels have both languages',async()=>{
  const f=await fixture();
  try{
    const first=await f.archive.runs.version('rules',{title:'one'});assert.equal(await f.archive.runs.version('rules',{title:'one'}),first);
    assert.notEqual(await f.archive.runs.version('rules',{title:'two'}),first);
    await f.archive.runs.checkpoint({...match(),captureIds:[1234]});assert.equal(await f.archive.runs.maxCapture(),1234);
    assert.deepEqual(Object.keys(persistenceLabels.de).sort(),Object.keys(persistenceLabels.en).sort());
  }finally{await f.close();}
});
