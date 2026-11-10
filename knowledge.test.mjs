import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createKnowledgeStore,knowledgeSchema} from './knowledge.mjs';
import {knowledgeText,knowledgeLabels} from './public/knowledge.mjs';
import {createArchive} from './archive.mjs';

const rule=(id='rule-1',status='notiz')=>({id,title:'Schnecken schützen',reason:'Agent B erreicht das Hinterland.',
  texts:{de:{title:'Schnecken schützen',reason:'Agent B erreicht das Hinterland.'},en:{title:'Protect snails',reason:'Agent B can reach the backline.'}},
  offer:'Schnecke',enemy:'Agent B',weight:-8,status,mode:'beide',phase:'battle_choice'});
function fixture(){
  const db=new DatabaseSync(':memory:');db.exec(knowledgeSchema);
  return {db,store:createKnowledgeStore((_read,fn)=>Promise.resolve().then(()=>fn(db)))};
}

test('all four legacy stores share one bilingual task per logical source and repeated sync is idempotent',async()=>{
  const {db,store}=fixture();
  try{
    const source={rules:[rule()],cases:[{id:'case-1',matchId:'match',capture:7,observation:'Check count',created:100,revision:{ruleId:'rule-1'}}],
      references:[{id:'ref-1',at:101,language:'en',matchId:'match',captureId:7,corrections:[{name:'Schnecke',phase:'enemy_field'}]}],
      findings:[{id:'old-1',titel:'Alt',beobachtung:'Archivbeobachtung',evidence:[7]}]};
    await store.sync(source);const first=await store.list();await store.sync(source);const second=await store.list();
    assert.deepEqual(second,first);assert.equal(first.items.length,3);
    const entry=first.items.find(item=>item.sources.some(source=>source.type==='rule'));
    assert.equal(entry.sources.length,2);assert.equal(entry.sources.find(s=>s.type==='case').matchId,'match');
    assert.equal(knowledgeText(entry,'de').title,'Schnecken schützen');assert.equal(knowledgeText(entry,'en').title,'Protect snails');
    assert.match(knowledgeText(first.items.find(item=>item.kind==='recognition'),'en').reason,/Snail/);
    assert.equal((await store.revisions(entry.id)).length,2);
  }finally{db.close();}
});

test('marking work done and changing its type does not activate a note or test rule',async()=>{
  const {db,store}=fixture();
  try{
    const original=rule();await store.sync({rules:[original]});let entry=(await store.list()).items[0];
    await store.update({id:entry.id,revision:entry.revision,reviewed:true,kind:'mechanic',workflow:'ready'});
    await store.sync({rules:[original]});entry=(await store.list()).items[0];
    assert.equal(entry.reviewed,true);assert.equal(entry.workflow,'ready');assert.equal(entry.ruleStatus,'notiz');
    assert.equal(entry.sources[0].original.status,'notiz');assert.equal(entry.kind,'mechanic');
    await assert.rejects(store.update({id:entry.id,revision:entry.revision,workflow:'active'}));
    await assert.rejects(store.update({id:entry.id,revision:entry.revision,workflow:'checking'}));
    assert.equal(original.status,'notiz');
  }finally{db.close();}
});

test('general mechanics require neither an individual card nor a weight, and both language edits share the identity',async()=>{
  const {db,store}=fixture();
  try{
    const {id}=await store.create({kind:'mechanic',language:'de',title:'Nur passende Formen aufwerten',reason:'Gemischte Formen getrennt behandeln.'});
    let item=(await store.list()).items[0];assert.equal(item.id,id);assert.equal(item.scope,'all');assert.equal(item.workflow,'collected');
    assert.equal(knowledgeText(item,'en'),null);
    await store.edit({id,revision:item.revision,language:'en',title:'Upgrade matching forms only',reason:'Keep mixed forms separate.'});
    item=(await store.list()).items[0];assert.equal(item.texts.de.title,'Nur passende Formen aufwerten');assert.equal(item.texts.de.stale,undefined);
    assert.equal(knowledgeText(item,'en').title,'Upgrade matching forms only');assert.equal(item.sources[0].weight,undefined);
    await store.sync({});assert.equal((await store.list()).items.length,1);assert.equal((await store.list()).items[0].sources[0].available,true);
    assert.equal((await store.revisions(id)).length,2);
  }finally{db.close();}
});

test('source changes and disappearance retain original versions; only the real rule store controls activation',async()=>{
  const {db,store}=fixture();
  try{
    await store.sync({rules:[rule()]});const id=(await store.list()).items[0].id;
    await store.sync({rules:[{...rule('rule-1','aktiv'),reason:'Changed'}]});
    let item=(await store.list()).items[0];assert.equal(item.workflow,'active');assert.equal(item.id,id);
    assert.equal((await store.revisions(id))[0].data.data.original.reason,rule().reason);
    await store.sync({rules:[]});item=(await store.list()).items[0];assert.equal(item.sources[0].available,false);
    assert.equal(item.workflow,'collected');assert.equal(item.ruleStatus,null);
    assert.equal((await store.revisions(id)).at(-1).event,'source_unavailable');
    await store.sync({rules:[rule()]});assert.equal((await store.list()).items[0].id,id);
  }finally{db.close();}
});

test('later explicit case-to-rule linkage preserves history and source snapshots without duplicate queue entries',async()=>{
  const {db,store}=fixture();
  try{
    const review={id:'case-1',matchId:'m',capture:9,observation:'Player note',created:1,rule:rule()};
    await store.sync({cases:[review]});const old=(await store.list()).items[0];
    assert.equal(old.scope,'Schnecke');
    await store.update({id:old.id,revision:old.revision,reviewed:true});
    await store.sync({rules:[rule()],cases:[{...review,revision:{ruleId:'rule-1'}}]});
    const items=(await store.list()).items;assert.equal(items.length,1);assert.equal(items[0].sources.length,2);
    const events=await store.revisions(old.id);assert.ok(events.some(event=>event.event==='work_updated'));
    assert.ok(events.some(event=>event.event==='linked'));assert.equal(events[0].data.data.original.observation,'Player note');
  }finally{db.close();}
});

test('duplicates are suggested without merging unrelated scopes and stale edits cannot overwrite newer work',async()=>{
  const {db,store}=fixture();
  try{
    await store.sync({rules:[rule('a'),rule('b'),{...rule('c'),enemy:'Kapitän'}]});
    const rows=(await store.list()).items;assert.equal(rows.length,3);assert.equal(rows.filter(row=>row.duplicates.length).length,2);
    const entry=rows[0];await store.update({id:entry.id,revision:entry.revision,reviewed:true});
    await assert.rejects(store.update({id:entry.id,revision:entry.revision,reviewed:false}),/aktualisieren/);
    await assert.rejects(store.update({id:entry.id,revision:entry.revision+1,unexpected:'field'}));
    for(const locale of ['de','en'])assert.deepEqual(Object.keys(knowledgeLabels[locale]).sort(),Object.keys(knowledgeLabels.de).sort());
  }finally{db.close();}
});

test('additive migration is restart safe, SQLite backup restores tasks, and rollback leaves legacy tables untouched',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'coach-knowledge-'));
  try{
    const file=path.join(folder,'archive.sqlite3');
    const before=new DatabaseSync(file);before.exec(await readFile(new URL('./data/archive-schema.sql',import.meta.url),'utf8'));
    before.prepare('INSERT INTO erkenntnisse VALUES (?,?,?,?,?,?,?)').run('legacy','all','old','old','Legacy title','Legacy note','{}');before.close();
    const archive=createArchive(file,folder);await archive.initializeReview();await archive.initializeReview();
    assert.equal((await archive.knowledge.findings()).length,1);
    await archive.knowledge.sync({findings:await archive.knowledge.findings()});
    const created=await archive.knowledge.create({kind:'mechanic',language:'de',title:'Alle Formen',reason:'Keine konkrete Karte nötig.'});
    const connection=new DatabaseSync(file);await backup(connection,path.join(folder,'backup.sqlite3'));connection.close();
    const restored=new DatabaseSync(path.join(folder,'backup.sqlite3'));
    const restoredStore=createKnowledgeStore((_read,fn)=>Promise.resolve().then(()=>fn(restored)));
    assert.ok((await restoredStore.list()).items.some(item=>item.id===created.id));
    assert.equal(restored.prepare('SELECT titel FROM erkenntnisse WHERE id=?').get('legacy').titel,'Legacy title');
    // Old versions ignore the additive tables and still read exactly the original records.
    assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM erkenntnisse').get().n,1);restored.close();
    const restarted=createArchive(file,folder);await restarted.initializeReview();assert.equal((await restarted.knowledge.list()).items.length,2);
  }finally{await rm(folder,{recursive:true,force:true});}
});
