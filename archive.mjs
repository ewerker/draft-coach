import {reviewQueries,reviewSchema} from './review.mjs';
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
  async function initializeReview(){
    if(!existsSync(file)){
      await mkdir(path.dirname(file),{recursive:true});
      const schema=await readFile(new URL('./data/archive-schema.sql',import.meta.url),'utf8');
      await withDatabase(false,db=>db.exec(schema));
    }
    await withDatabase(false,db=>db.exec(`CREATE TABLE IF NOT EXISTS partie_protokoll (
      partie_id TEXT PRIMARY KEY REFERENCES partien(id), details_json TEXT NOT NULL
    ); `+reviewSchema));
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
        games:archived.size,pending:new Set(games.filter(game=>!archived.has(game.id)).map(game=>game.id)).size,
        evidence:database.prepare('SELECT COUNT(*) AS count FROM belege').get().count,
        insights:database.prepare('SELECT COUNT(*) AS count FROM erkenntnisse').get().count,
        bytes:size.size,recent:database.prepare(`SELECT modus,ergebnis,ende_ms,aufnahmezahl,
          (SELECT COUNT(*) FROM belege WHERE partie_id=partien.id) AS bilder
          FROM partien ORDER BY ende_ms DESC LIMIT 20`).all()
      };
    });
  }
  function archiveGames(matchId){
    return exclusive(async()=>{
      const [games,clicks]=await Promise.all([journal('partien.jsonl'),journal('antippen.jsonl')]);
      const counts=await withDatabase(false,async database=>{
        database.exec(`CREATE TABLE IF NOT EXISTS partie_protokoll (
          partie_id TEXT PRIMARY KEY REFERENCES partien(id), details_json TEXT NOT NULL
        )`);
        const exists=database.prepare('SELECT 1 FROM partien WHERE id=?');
        const addGame=database.prepare(`INSERT INTO partien
          (id,modus,coach_modus,ergebnis,beginn_ms,ende_ms,aufnahmezahl,aufnahme_ids_json,quelle,notiz)
          VALUES (?,?,?,?,?,?,?,?,?,?)`);
        const addDetails=database.prepare('INSERT INTO partie_protokoll VALUES (?,?)');
        const addClick=database.prepare(`INSERT INTO klickprotokoll
          (partie_id,aufnahme,zeit,art,karte,ergebnis,details_json) VALUES (?,?,?,?,?,?,?)`);
        const addImage=database.prepare(`INSERT INTO belege
          (aufnahme,partie_id,titel,quellbild,ausschnitt_json,breite,hoehe,mime,sha256,bild)
          VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(aufnahme) DO NOTHING`);
        let imported=0,images=0;
        for(const game of games){
          if((matchId&&game.id!==matchId)||exists.get(game.id))continue;
          const ids=new Set(game.captureIds.filter(Number.isSafeInteger));
          const evidence=await pickEvidence(runtime,game,ids);
          let addedImages=0;
          database.exec('BEGIN IMMEDIATE');
          try{
            // Recheck under the write lock in case another process imported this match.
            if(!exists.get(game.id)){
              addGame.run(game.id,game.mode,game.mode,game.outcome,game.started,game.ended,ids.size,JSON.stringify([...ids]),'partien.jsonl','');
              addDetails.run(game.id,JSON.stringify(game));
              for(const click of clicks){
                const time=Date.parse(click.zeit);
                if(ids.has(click.aufnahme)&&time>=game.started&&time<=game.ended)
                  addClick.run(game.id,click.aufnahme,click.zeit,click.art,click.karte??null,click.ergebnis,JSON.stringify(click));
              }
              for(const {id,name,png} of evidence)
                addedImages+=addImage.run(id,game.id,'Partieaufnahme '+id,name,null,
                  png.readUInt32BE(16),png.readUInt32BE(20),'image/png',createHash('sha256').update(png).digest('hex'),png).changes;
              imported++;
            }
            database.exec('COMMIT');
            images+=addedImages;
          }catch(error){
            database.exec('ROLLBACK');
            throw error;
          }
        }
        return {imported,images};
      });
      return {...counts,status:await status()};
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
  return {status,archiveGames,sendBackup,initializeReview,review:reviewQueries(journal,withDatabase,runtime),get busy(){return busy;}};
}

async function pickEvidence(runtime,game,ids){
  const captures=[...ids];
  const hearts=(game.heartTimeline??[]).map(entry=>entry.captureId).filter(id=>ids.has(id));
  const variants=(game.variantEvidence??[]).flatMap(({before,after})=>[before,after]).filter(id=>ids.has(id));
  const result=ids.has(game.resultCapture)?game.resultCapture:undefined;
  const candidates=new Set([result,...variants,captures.at(-1),captures[0],...hearts.reverse(),...captures.slice(-12).reverse()]);
  const evidence=[];
  for(const id of candidates){
    if(id===undefined)continue;
    const name='capture-'+id+'.png';
    const png=await readFile(path.join(runtime,name)).catch(error=>{
      if(error.code==='ENOENT')return null;
      throw error;
    });
    if(!png||png.length<24||png.readUInt32BE(0)!==0x89504e47)continue;
    evidence.push({id,name,png});
    if(evidence.length===5)break;
  }
  return evidence;
}
