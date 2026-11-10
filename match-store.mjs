import {createHash,randomUUID} from 'node:crypto';

export const matchStoreSchema=`
CREATE TABLE IF NOT EXISTS match_runs (
 id TEXT PRIMARY KEY, status TEXT NOT NULL, updated INTEGER NOT NULL,
 outcome TEXT, data TEXT NOT NULL, evidence_saved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS runtime_versions (
 hash TEXT PRIMARY KEY, kind TEXT NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_actions (
 id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES match_runs(id), capture INTEGER,
 created INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS match_actions_match ON match_actions(match_id,capture);
CREATE TABLE IF NOT EXISTS background_jobs (
 id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES match_runs(id), kind TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL, updated INTEGER NOT NULL, error TEXT, report TEXT
);
CREATE TABLE IF NOT EXISTS background_job_reports (
 id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES background_jobs(id), created INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_assets (
 sha256 TEXT PRIMARY KEY, bytes INTEGER NOT NULL, image BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS run_images (
 match_id TEXT NOT NULL REFERENCES match_runs(id), capture INTEGER NOT NULL,
 sha256 TEXT NOT NULL REFERENCES evidence_assets(sha256), width INTEGER NOT NULL, height INTEGER NOT NULL,
 PRIMARY KEY(match_id,capture)
);
CREATE INDEX IF NOT EXISTS belege_partie_index ON belege(partie_id);
CREATE INDEX IF NOT EXISTS klickprotokoll_partie_index ON klickprotokoll(partie_id);
`;
export const imageLimits=Object.freeze({perMatch:80,perMatchBytes:64*1024*1024,totalNewBytes:2*1024*1024*1024});
const encode=value=>JSON.stringify(value,(key,v)=>key==='captureDone'||key==='saving'?undefined:
  v instanceof Map?{$coachMap:[...v]}:v instanceof Set?{$coachSet:[...v]}:v);
const decode=text=>JSON.parse(text,(_key,v)=>v&&typeof v==='object'&&Object.keys(v).length===1?
  Array.isArray(v.$coachMap)?new Map(v.$coachMap):Array.isArray(v.$coachSet)?new Set(v.$coachSet):v:v);
export function snapshotMatch(match){return encode(match);}
export function restoreMatch(text){
  const match=decode(text);
  if(typeof match.id!=='string'||!Number.isSafeInteger(match.started)||!Array.isArray(match.captureIds))throw Error('Ungültiger Partiestand.');
  // An old outstanding click must never be replayed merely because the process restarted.
  match.pendingReinforcement=null;match.pendingVariantEvidence=null;match.resultCandidate=null;
  return match;
}
export function plainGame(match,outcome=match.outcome??'unbekannt',ended=match.ended??Date.now()){
  const {id,mode,started,captureIds=[],heartTimeline=[],lineup,learnedLineup,cardValueChanges=[],reviewFrames=[],variantEvidence=[],resultCapture,versions,device,language}=match;
  return {id,mode,started,ended,captureIds,heartTimeline,lineup,learnedLineup,cardValueChanges,reviewFrames,variantEvidence,resultCapture,
    outcome,language:language??reviewFrames.at(-1)?.language??'de',versions,device};
}
export function createMatchStore(withDatabase,{now=Date.now}={}){
  function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
  async function checkpoint(match,status='active'){
    if(!['active','paused','interrupted'].includes(status))throw Error('Ungültiger Partiestatus.');
    const payload=snapshotMatch(match),at=now();
    return withDatabase(false,db=>db.prepare(`INSERT INTO match_runs(id,status,updated,data) VALUES(?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated=excluded.updated,data=excluded.data
      WHERE match_runs.status!='completed'`).run(match.id,status,at,payload));
  }
  async function complete(match,outcome){
    if(!['gewonnen','verloren','abgebrochen','unbekannt'].includes(outcome))throw Error('Ungültiges Partieergebnis.');
    const game=plainGame(match,outcome),at=now();
    return withDatabase(false,db=>transaction(db,()=>{
      const previous=db.prepare('SELECT * FROM match_runs WHERE id=?').get(game.id);
      if(previous?.status==='completed'){
        if(previous.outcome!==outcome)throw Error('Für diese Partie ist bereits ein anderes Ergebnis gespeichert.');
        return {created:false,game:plainGame(decode(previous.data),outcome)};
      }
      db.prepare(`INSERT INTO match_runs(id,status,updated,outcome,data) VALUES(?,'completed',?,?,?)
        ON CONFLICT(id) DO UPDATE SET status='completed',updated=excluded.updated,outcome=excluded.outcome,data=excluded.data`)
        .run(game.id,at,outcome,snapshotMatch({...match,...game}));
      db.prepare(`INSERT INTO partien (id,modus,coach_modus,ergebnis,beginn_ms,ende_ms,aufnahmezahl,aufnahme_ids_json,quelle,notiz)
        VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).run(game.id,game.mode,game.mode,outcome,game.started,game.ended,
          game.captureIds.length,JSON.stringify(game.captureIds),'durable_match','');
      db.prepare('INSERT INTO partie_protokoll VALUES (?,?) ON CONFLICT(partie_id) DO UPDATE SET details_json=excluded.details_json').run(game.id,JSON.stringify(game));
      for(const kind of ['archive','prepare_review'])db.prepare(`INSERT OR IGNORE INTO background_jobs(id,match_id,kind,next_at,updated) VALUES (?,?,?,?,?)`)
        .run(kind+':'+game.id,game.id,kind,at,at);
      return {created:true,game};
    }));
  }
  async function recover(){
    await withDatabase(false,db=>transaction(db,()=>{
      db.prepare("UPDATE match_runs SET status='interrupted' WHERE status IN ('active','paused')").run();
      db.prepare("UPDATE background_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,error='PROCESS_RESTARTED' WHERE status='running'").run();
    }));
    return recoverable();
  }
  async function recoverable(){return withDatabase(true,db=>db.prepare("SELECT * FROM match_runs WHERE status!='completed' ORDER BY updated DESC").all()
    .map(row=>{const match=decode(row.data);return {id:row.id,status:row.status,updated:row.updated,mode:match.mode,language:match.language??'de',
      started:match.started,captures:match.captureIds.length,device:match.device??null};}));}
  async function read(id){return withDatabase(true,db=>{const row=db.prepare('SELECT * FROM match_runs WHERE id=?').get(id);return row?{...row,match:restoreMatch(row.data)}:null;});}
  async function games(unfinishedOnly=false){return withDatabase(true,db=>db.prepare('SELECT * FROM match_runs'+(unfinishedOnly?" WHERE status!='completed'":'')+' ORDER BY updated DESC').all().map(row=>({
    ...plainGame(decode(row.data),row.outcome??'unbekannt',decode(row.data).ended??row.updated),runStatus:row.status,
    archiveStatus:row.status==='completed'?(row.evidence_saved?'archived':'pending'):'incomplete'})));}
  async function version(kind,data){
    const text=JSON.stringify(data),hash=createHash('sha256').update(kind+'\n'+text).digest('hex');
    await withDatabase(false,db=>db.prepare('INSERT OR IGNORE INTO runtime_versions VALUES (?,?,?,?)').run(hash,kind,now(),text));return hash;
  }
  async function action(matchId,entry){
    const id=randomUUID();
    await withDatabase(false,db=>db.prepare('INSERT INTO match_actions VALUES (?,?,?,?,?,?)').run(id,matchId,entry.aufnahme??null,now(),
      entry.ergebnis==='gesendet'?'sent':'failed',JSON.stringify({...entry,confirmation:'unconfirmed'})));return id;
  }
  async function observeTransition(matchId,capture,frame){
    return withDatabase(false,db=>{
      for(const row of db.prepare("SELECT * FROM match_actions WHERE match_id=? AND status='sent' AND capture<?").all(matchId,capture)){
        const original=JSON.parse(row.data),before=original.offerSignature;
        const signature=JSON.stringify((frame.offers??[]).map(({name,action,quantity})=>[name,action,quantity]));
        if(frame.phase!=='battle'&&(!before||before===signature))continue;
        db.prepare("UPDATE match_actions SET status='transition_observed',data=? WHERE id=?").run(JSON.stringify({...original,
          confirmation:'screen_transition_only',followupCapture:capture,actualChoice:'unverified'}),row.id);
      }
    });
  }
  async function actions(matchId){return withDatabase(true,db=>db.prepare('SELECT * FROM match_actions WHERE match_id=? ORDER BY created,id').all(matchId)
    .map(row=>({...JSON.parse(row.data),id:row.id,evidenceStatus:row.status})));}
  async function storeImages(matchId,images,limits=imageLimits){
    return withDatabase(false,db=>transaction(db,()=>{
      if(!db.prepare('SELECT 1 FROM match_runs WHERE id=?').get(matchId))throw Error('Partie nicht gesichert.');
      let total=db.prepare('SELECT coalesce(sum(bytes),0) AS n FROM evidence_assets').get().n;
      let perMatch=db.prepare('SELECT coalesce(sum(a.bytes),0) AS n FROM evidence_assets a WHERE a.sha256 IN (SELECT sha256 FROM run_images WHERE match_id=?)').get(matchId).n;
      let count=db.prepare('SELECT count(*) AS n FROM run_images WHERE match_id=?').get(matchId).n,added=0,skipped=0;
      for(const image of images){
        if(db.prepare('SELECT 1 FROM run_images WHERE match_id=? AND capture=?').get(matchId,image.id))continue;
        const hash=createHash('sha256').update(image.png).digest('hex');
        const exists=db.prepare('SELECT 1 FROM evidence_assets WHERE sha256=?').get(hash);
        const inMatch=db.prepare('SELECT 1 FROM run_images WHERE match_id=? AND sha256=?').get(matchId,hash);
        if(count>=limits.perMatch||!exists&&total+image.png.length>limits.totalNewBytes||!inMatch&&perMatch+image.png.length>limits.perMatchBytes){skipped++;continue;}
        if(!exists){db.prepare('INSERT INTO evidence_assets VALUES (?,?,?)').run(hash,image.png.length,image.png);total+=image.png.length;}
        if(!inMatch)perMatch+=image.png.length;
        db.prepare('INSERT INTO run_images VALUES (?,?,?,?,?)').run(matchId,image.id,hash,image.png.readUInt32BE(16),image.png.readUInt32BE(20));count++;added++;
      }
      return {added,skipped};
    }));
  }
  async function jobs(){return withDatabase(true,db=>db.prepare('SELECT * FROM background_jobs ORDER BY updated DESC,id').all()
    .map(row=>({...row,report:row.report?JSON.parse(row.report):null})));}
  async function claim(){return withDatabase(false,db=>transaction(db,()=>{
    const row=db.prepare(`SELECT * FROM background_jobs j WHERE status='pending' AND attempts<3 AND next_at<=?
      AND (kind='archive' OR EXISTS(SELECT 1 FROM background_jobs a WHERE a.id='archive:'||j.match_id AND a.status='done'))
      ORDER BY next_at,CASE kind WHEN 'archive' THEN 0 ELSE 1 END,id LIMIT 1`).get(now());
    if(!row)return null;
    db.prepare("UPDATE background_jobs SET status='running',attempts=attempts+1,updated=? WHERE id=?").run(now(),row.id);
    return {...row,attempts:row.attempts+1};
  }));}
  async function finishJob(id,report){await withDatabase(false,db=>transaction(db,()=>{
    if(!db.prepare("SELECT 1 FROM background_jobs WHERE id=? AND status='running'").get(id))return;
    const text=JSON.stringify(report);
    db.prepare('INSERT INTO background_job_reports (job_id,created,data) VALUES (?,?,?)').run(id,now(),text);
    db.prepare("UPDATE background_jobs SET status='done',updated=?,error=NULL,report=? WHERE id=?").run(now(),text,id);
  }));}
  async function failJob(job,error){await withDatabase(false,db=>db.prepare(`UPDATE background_jobs SET status=?,updated=?,next_at=?,error=? WHERE id=? AND status='running'`)
    .run(job.attempts>=3?'failed':'pending',now(),now()+Math.min(60000,1000*2**job.attempts),String(error.message??error).slice(0,500),job.id));}
  async function retry(id){
    const result=await withDatabase(false,db=>db.prepare("UPDATE background_jobs SET status='pending',attempts=0,next_at=?,updated=?,error=NULL WHERE id=? AND status!='running'").run(now(),now(),id));
    if(!result.changes)throw Error('Auftrag nicht gefunden oder läuft bereits.');
  }
  async function release(job){await withDatabase(false,db=>db.prepare("UPDATE background_jobs SET status='pending',attempts=max(0,attempts-1),next_at=?,updated=? WHERE id=? AND status='running'")
    .run(now()+1000,now(),job.id));}
  async function report(matchId){
    const row=await read(matchId);if(!row)throw Error('Partie nicht gefunden.');
    const entries=await actions(matchId),frames=row.match.reviewFrames??[];
    const imageCount=await withDatabase(true,db=>db.prepare('SELECT count(*) AS n FROM run_images WHERE match_id=?').get(matchId).n);
    return {kind:'data_completeness',matchId,outcome:row.outcome??'unbekannt',language:row.match.language??'de',
      captures:row.match.captureIds.length,decisions:frames.length,images:imageCount,
      unknownOffers:frames.reduce((n,frame)=>n+(frame.offers??[]).filter(o=>!o.name||o.action==='unknown').length,0),
      missingVersions:frames.filter(frame=>!frame.versions).length,failedActions:entries.filter(a=>a.evidenceStatus==='failed').length,
      sentActions:entries.filter(a=>a.evidenceStatus!=='failed').length,manualBrowserActions:entries.filter(a=>a.art!=='automatisch').length,
      transitionsObserved:entries.filter(a=>a.evidenceStatus==='transition_observed').length,
      actualPhoneChoices:'not_verified',tacticalEffect:'not_tested',at:now()};
  }
  async function imageStatus(){return withDatabase(true,db=>({limits:imageLimits,
    newBytes:db.prepare('SELECT coalesce(sum(bytes),0) AS n FROM evidence_assets').get().n,
    assets:db.prepare('SELECT count(*) AS n FROM evidence_assets').get().n,
    images:db.prepare('SELECT count(*) AS n FROM run_images').get().n}));}
  async function maxCapture(){return withDatabase(true,db=>db.prepare("SELECT coalesce(json_extract(data,'$.captureIds[#-1]'),0) AS n FROM match_runs").all()
    .reduce((maximum,row)=>Math.max(maximum,row.n),db.prepare('SELECT coalesce(max(aufnahme),0) AS n FROM belege').get().n));}
  return {checkpoint,complete,recover,recoverable,read,games,version,action,actions,observeTransition,storeImages,jobs,claim,finishJob,failJob,retry,release,report,imageStatus,maxCapture};
}

export function createJobRunner(store,{busy,playing=busy,handlers}){
  let working=false;
  async function tick(){
    if(working||busy())return false;
    working=true;let job;
    try{
      job=await store.claim();if(!job)return false;
      if(busy()){await store.release(job);return false;}
      const handler=handlers[job.kind];if(!handler)throw Error('Unknown job kind');
      const report=await handler(job,()=>{if(playing())throw Object.assign(Error('PLAY_STARTED'),{code:'PLAY_STARTED'});});
      await store.finishJob(job.id,report);return true;
    }catch(error){
      if(job){if(error.code==='PLAY_STARTED')await store.release(job);else await store.failJob(job,error);}
      else throw error;
      return false;
    }finally{working=false;}
  }
  return {tick,get working(){return working;}};
}
