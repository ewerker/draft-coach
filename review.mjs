import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {recommend} from './advice.mjs';

export const reviewSchema=`
CREATE TABLE IF NOT EXISTS review_cases (
  id TEXT PRIMARY KEY, match_id TEXT NOT NULL, capture INTEGER NOT NULL,
  created INTEGER NOT NULL, data TEXT NOT NULL, image BLOB
);
CREATE TABLE IF NOT EXISTS review_revisions (
  id INTEGER PRIMARY KEY, case_id TEXT NOT NULL REFERENCES review_cases(id),
  created INTEGER NOT NULL, data TEXT NOT NULL
);
`;

export function reviewReplay(frame, mode, collection, db, rules, proposed){
  const score=list=>{
    const result=recommend(frame,mode,collection,db,false,list);
    const tip=result.best??result.fallback??result.provisional;
    return tip?{name:tip.name,action:frame.offers[tip.index]?.action,quantity:frame.offers[tip.index]?.quantity,score:tip.score,reason:tip.reason}:null;
  };
  return {before:score(rules),after:score(proposed?[...rules,{...proposed,status:'aktiv'}]:rules)};
}

export function reviewQueries(journal,withDatabase,runtime){
  async function matches(){
    const games=await journal('partien.jsonl');
    const merged=new Map(games.map(game=>[game.id,game]));
    const stored=await withDatabase(true,db=>db.prepare('SELECT details_json FROM partie_protokoll ORDER BY rowid DESC LIMIT 200').all());
    for(const row of stored){
      const game=JSON.parse(row.details_json);
      if(!merged.has(game.id))merged.set(game.id,game);
    }
    return [...merged.values()].sort((a,b)=>b.ended-a.ended);
  }
  async function match(id){
    const game=(await matches()).find(game=>game.id===id);
    if(!game)throw Error('Partie nicht gefunden.');
    const ids=new Set(game.captureIds);
    const clicks=(await journal('antippen.jsonl')).filter(click=>ids.has(click.aufnahme)&&Date.parse(click.zeit)>=game.started&&Date.parse(click.zeit)<=game.ended);
    const archived=await withDatabase(true,db=>db.prepare('SELECT details_json FROM klickprotokoll WHERE partie_id=?').all(id).map(row=>JSON.parse(row.details_json)));
    const allClicks=[...new Map([...archived,...clicks].map(click=>[JSON.stringify([click.aufnahme,click.zeit,click.art]),click])).values()];
    const frames=new Map((game.reviewFrames??[]).map(frame=>[frame.id,frame]));
    for(const click of allClicks)if(!frames.has(click.aufnahme))frames.set(click.aufnahme,{id:click.aufnahme});
    return {...game,frames:[...frames.values()].sort((a,b)=>a.id-b.id).map(frame=>({...frame,clicks:allClicks.filter(click=>click.aufnahme===frame.id)}))};
  }
  async function image(game,capture){
    if(!Number.isSafeInteger(capture)||!game.captureIds.includes(capture))return null;
    const stored=await withDatabase(true,db=>db.prepare('SELECT bild AS image FROM belege WHERE partie_id=? AND aufnahme=? UNION ALL SELECT image FROM review_cases WHERE match_id=? AND capture=? AND image IS NOT NULL LIMIT 1').get(game.id,capture,game.id,capture));
    if(stored?.image)return Buffer.from(stored.image);
    return readFile(path.join(runtime,'capture-'+capture+'.png')).catch(error=>{
      if(error.code==='ENOENT')return null;
      throw error;
    });
  }
  async function save(game,frame,observation,rule,template=null,preferred=null){
    const id=randomUUID(), created=Date.now();
    const png=await image(game,frame.id);
    await withDatabase(false,db=>db.prepare('INSERT INTO review_cases VALUES (?,?,?,?,?,?)')
      .run(id,game.id,frame.id,created,JSON.stringify({observation,rule,frame,template,preferred}),png));
    return id;
  }
  async function list(){
    return withDatabase(true,db=>db.prepare(`
      SELECT id,match_id,capture,created,data,
        (SELECT data FROM review_revisions WHERE case_id=review_cases.id ORDER BY id DESC LIMIT 1) AS revision
      FROM review_cases ORDER BY created DESC LIMIT 100`).all().map(row=>{
      const {observation,rule,template,preferred}=JSON.parse(row.data);
      return {id:row.id,matchId:row.match_id,capture:row.capture,created:row.created,observation,rule,preferred,
        template:template?{name:template.name,language:template.language,enabled:template.enabled!==false}:null,revision:row.revision?JSON.parse(row.revision):null};
    }));
  }
  async function templates(){
    return withDatabase(true,db=>db.prepare("SELECT data FROM review_cases WHERE json_extract(data,'$.template') IS NOT NULL AND coalesce(json_extract(data,'$.template.enabled'),1)=1 ORDER BY created DESC LIMIT 80").all()
      .map(row=>JSON.parse(row.data).template));
  }
  async function revise(id,revision){
    await withDatabase(false,db=>db.prepare('INSERT INTO review_revisions (case_id,created,data) VALUES (?,?,?)')
      .run(id,Date.now(),JSON.stringify(revision)));
  }
  async function toggleTemplate(id,enabled){
    if(typeof enabled!=='boolean')throw Error('Ungültiger Vorlagenstatus.');
    await withDatabase(false,db=>db.prepare("UPDATE review_cases SET data=json_set(data,'$.template.enabled',json(?)) WHERE id=? AND json_extract(data,'$.template') IS NOT NULL")
      .run(JSON.stringify(enabled),id));
  }
  return {matches,match,image,save,list,templates,revise,toggleTemplate};
}
