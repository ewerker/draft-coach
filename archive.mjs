import {reviewQueries,reviewSchema,selectEvidenceIds} from './review.mjs';
import {createKnowledgeStore,knowledgeSchema} from './knowledge.mjs';
import {createImageReviewStore,imageReviewSchema} from './image-review.mjs';
import {createMatchStore,matchStoreSchema,imageLimits,plainGame} from './match-store.mjs';
import {sendFullBackup} from './full-backup.mjs';
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,rm,rmdir,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

async function readJournal(file){
  const text=await readFile(file,'utf8').catch(error=>{
    if(error.code==='ENOENT')return '';
    throw error;
  });
  // An append may still be writing its final line.
  const complete=text.slice(0,text.lastIndexOf('\n')+1);
  return complete.split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line));
}

export function createArchive(file,runtime){
  let busy=false;
  const journal=name=>readJournal(path.join(runtime,name));
  const open=(readOnly=false)=>new DatabaseSync(file,{readOnly,enableForeignKeyConstraints:true});
  function withDatabase(readOnly,operation){
    const database=open(readOnly);
    return Promise.resolve().then(()=>operation(database)).finally(()=>database.close());
  }
  const runs=createMatchStore(withDatabase);
  async function initializeReview(){
    if(!existsSync(file)){
      await mkdir(path.dirname(file),{recursive:true});
      const schema=await readFile(new URL('./data/archive-schema.sql',import.meta.url),'utf8');
      await withDatabase(false,db=>db.exec(schema));
    }
    await withDatabase(false,db=>db.exec(`CREATE TABLE IF NOT EXISTS partie_protokoll (
      partie_id TEXT PRIMARY KEY REFERENCES partien(id), details_json TEXT NOT NULL
    ); `+reviewSchema));
    await withDatabase(false,db=>{
      db.exec('BEGIN IMMEDIATE');
      try{
        db.exec(knowledgeSchema+matchStoreSchema+imageReviewSchema);
        if(db.prepare('PRAGMA user_version').get().user_version<2)db.exec('PRAGMA user_version=2');
        db.exec('COMMIT');
      }
      catch(error){db.exec('ROLLBACK');throw error;}
    });
  }
  async function exclusive(operation){
    if(busy)throw Error('Ein Archivvorgang läuft bereits.');
    busy=true;
    try{return await operation();}
    finally{busy=false;}
  }
  async function status(){
    const [games,size]=await Promise.all([journal('partien.jsonl'),stat(file)]);
    return withDatabase(true,database=>{
      const archived=new Set(database.prepare('SELECT id FROM partien').all().map(row=>row.id));
      return {
        games:archived.size,pending:new Set([...games.filter(game=>!archived.has(game.id)).map(game=>game.id),
          ...database.prepare("SELECT match_id FROM background_jobs WHERE kind='archive' AND status!='done'").all().map(row=>row.match_id)]).size,
        evidence:database.prepare('SELECT COUNT(*) AS count FROM belege').get().count,
        insights:database.prepare('SELECT COUNT(*) AS count FROM erkenntnisse').get().count,
        findings:database.prepare('SELECT id,titel,beobachtung FROM erkenntnisse ORDER BY rowid DESC LIMIT 100').all(),
        bytes:size.size,recent:database.prepare(`SELECT id,modus,ergebnis,ende_ms,aufnahmezahl,
          (SELECT COUNT(*) FROM belege WHERE partie_id=partien.id) AS bilder
          FROM partien ORDER BY ende_ms DESC LIMIT 20`).all()
      };
    });
  }
  function archiveGames(matchId,guard=()=>{}){
    return exclusive(async()=>{
      const single=matchId?await runs.read(matchId):null;
      const [legacy,clicks,durable]=await Promise.all([
        single?[]:journal('partien.jsonl'),
        single?.match.versions?runs.actions(matchId):journal('antippen.jsonl'),
        single?[{...plainGame(single.match,single.outcome),runStatus:single.status}]:runs.games()
      ]);
      const games=[...new Map([...legacy,...durable.filter(game=>game.runStatus==='completed')].map(game=>[game.id,game])).values()];
      let imported=0,images=0,skipped=0;
      for(const game of games){
        guard();
        if(matchId&&game.id!==matchId)continue;
        const previous=await withDatabase(true,db=>({archived:!!db.prepare('SELECT 1 FROM partien WHERE id=?').get(game.id),run:db.prepare('SELECT evidence_saved FROM match_runs WHERE id=?').get(game.id)}));
        if(previous.archived&&(!previous.run||previous.run.evidence_saved))continue;
        const completed=await runs.complete(game,game.outcome);if(completed.created)imported++;
        const evidence=await pickEvidence(runtime,game,new Set(game.captureIds));
        guard();
        const preserved=await runs.storeImages(game.id,evidence);skipped+=preserved.skipped;
        images+=await withDatabase(false,db=>{
          db.exec('BEGIN IMMEDIATE');
          try{
            const addClick=db.prepare('INSERT INTO klickprotokoll (partie_id,aufnahme,zeit,art,karte,ergebnis,details_json) VALUES (?,?,?,?,?,?,?)');
            const hasClick=db.prepare('SELECT 1 FROM klickprotokoll WHERE partie_id=? AND aufnahme=? AND zeit=? AND art=?');
            for(const click of clicks)if(game.captureIds.includes(click.aufnahme)&&(!click.partie||click.partie===game.id)&&
              Date.parse(click.zeit)>=game.started&&Date.parse(click.zeit)<=game.ended&&!hasClick.get(game.id,click.aufnahme,click.zeit,click.art))
              addClick.run(game.id,click.aufnahme,click.zeit,click.art,click.karte??null,click.ergebnis,JSON.stringify(click));
            const result=db.prepare(`INSERT INTO belege (aufnahme,partie_id,titel,quellbild,ausschnitt_json,breite,hoehe,mime,sha256,bild)
              SELECT capture,match_id,'Partieaufnahme '||capture,'capture-'||capture||'.png',NULL,width,height,'image/png',sha256,zeroblob(0)
              FROM run_images WHERE match_id=? ON CONFLICT(aufnahme) DO NOTHING`).run(game.id);
            db.prepare('UPDATE match_runs SET evidence_saved=1 WHERE id=?').run(game.id);
            db.exec('COMMIT');return result.changes;
          }catch(error){db.exec('ROLLBACK');throw error;}
        });
      }
      return {imported,images,skipped,status:await status()};

    });
  }
  function sendBackup(response){
    return exclusive(async()=>{
      const directory=await mkdtemp(path.join(tmpdir(),'draft-coach-backup-'));
      try{
        const copy=path.join(directory,'Draft-Coach.sqlite3');
        await withDatabase(true,database=>backup(database,copy));
        response.writeHead(200,{
          'Content-Type':'application/vnd.sqlite3','Content-Disposition':'attachment; filename="Draft-Coach-Archiv.sqlite3"',
          'Content-Length':(await stat(copy)).size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
        });
        await pipeline(createReadStream(copy),response);
      }finally{
        await rm(path.join(directory,'Draft-Coach.sqlite3'),{force:true});
        await rmdir(directory);
      }
    });
  }
  async function preserveRunImages(game){return runs.storeImages(game.id,await pickEvidence(runtime,game,new Set(game.captureIds)));}
  const sendBundle=(response,python)=>exclusive(()=>sendFullBackup(response,{runtime,databaseFile:file,python,
    copyDatabase:destination=>withDatabase(true,db=>backup(db,destination))}));
  return {status,archiveGames,sendBackup,sendBundle,initializeReview,runs,preserveRunImages,
    review:reviewQueries(journal,withDatabase,runtime,runs),knowledge:createKnowledgeStore(withDatabase),imageReview:createImageReviewStore(withDatabase),get busy(){return busy;}};
}

async function pickEvidence(runtime,game,ids){
  const candidates=selectEvidenceIds(game);
  const evidence=[];
  const hashes=new Map();let bytes=0;
  for(const id of candidates){
    if(id===undefined)continue;
    const name='capture-'+id+'.png';
    const png=await readFile(path.join(runtime,name)).catch(error=>{
      if(error.code==='ENOENT')return null;
      throw error;
    });
    if(!png||png.length<24||png.readUInt32BE(0)!==0x89504e47)continue;
    const hash=createHash('sha256').update(png).digest('hex');
    if(!hashes.has(hash)&&bytes+png.length>imageLimits.perMatchBytes)continue;
    if(!hashes.has(hash)){hashes.set(hash,png);bytes+=png.length;}
    evidence.push({id,name,png:hashes.get(hash)});
    if(evidence.length===80)break;
  }
  return evidence;
}
