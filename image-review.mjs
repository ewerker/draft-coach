import {createHash} from 'node:crypto';
export const imageReviewSchema=`CREATE TABLE IF NOT EXISTS image_questions (
 id TEXT PRIMARY KEY, match_id TEXT NOT NULL, capture_id INTEGER NOT NULL, image_hash TEXT NOT NULL,
 created INTEGER NOT NULL, purpose TEXT NOT NULL, partition TEXT NOT NULL, context_json TEXT NOT NULL,
 image BLOB NOT NULL, revision INTEGER NOT NULL DEFAULT 0, answer_json TEXT,
 export_status TEXT NOT NULL DEFAULT 'unanswered', export_error TEXT, reference_id TEXT,
 UNIQUE(match_id,image_hash));
 CREATE TABLE IF NOT EXISTS image_question_history (
 question_id TEXT NOT NULL, revision INTEGER NOT NULL, at INTEGER NOT NULL, answer_json TEXT NOT NULL,
 PRIMARY KEY(question_id,revision));`;
export const fieldPartition=id=>createHash('sha256').update(id).digest()[0]%4===0?'test':'training';
const hash=value=>createHash('sha256').update(value).digest('hex');
// Freeze match allocation before answers. A random control is drawn independently
// of recognition confidence; targeted cases do not stand in for overall accuracy.
export function selectImageQuestions(game){
 const frames=(game.frames??game.reviewFrames??[]).filter(f=>['battle_choice','spell_choice'].includes(f.phase));
 const strata=new Map();
 for(const frame of frames){const key=[frame.phase,frame.language??game.language,frame.geometry?.layout??'unknown'].join('|');if(!strata.has(key))strata.set(key,[]);strata.get(key).push(frame);}
 const controls=[...strata.entries()].sort(([a],[b])=>hash(game.id+':stratum:'+a).localeCompare(hash(game.id+':stratum:'+b))).map(([,rows])=>rows.slice().sort((a,b)=>hash(game.id+':control:'+a.id).localeCompare(hash(game.id+':control:'+b.id)))[0]);
 const score=f=>['own','enemy'].reduce((sum,side)=>{const s=f.armyObservation?.sides?.[side];return sum+(!s?.groups?.length?5:0)+(s?.unknownRegions?.length??0)+(s?.groups??[]).filter(g=>g.poolConflict||g.actionCountConflict||g.unknownFormCount).length;},0)+(f.clicks??[]).filter(c=>c.karte&&c.karte!==(f.advice?.best??f.advice?.fallback??f.advice?.provisional)?.name).length*4;
 const selected=controls.slice(0,1).map(frame=>({frame,purpose:'control'}));
 for(const frame of frames.slice().sort((a,b)=>score(b)-score(a)||b.id-a.id)){
  if(selected.some(s=>s.frame.id===frame.id))continue;
  // Keep early and late formations, instead of many near-identical animations.
  if(selected.length===1&&frames.length>3&&frame.id!==frames[0].id)continue;
  selected.push({frame,purpose:'targeted'});if(selected.length===3)break;
 }
 if(selected.length<3)for(const frame of frames.slice().reverse())if(!selected.some(s=>s.frame.id===frame.id)){selected.push({frame,purpose:'targeted'});if(selected.length===3)break;}
 return selected;
}
export function validateImageAnswer(input,names){
 if(!input||typeof input!=='object')throw Error('INVALID_IMAGE_ANSWER');
 const result={schema:1,actor:'player',sides:{}};
 for(const side of ['own','enemy']){
  const value=input.sides?.[side];if(!value)continue;
  if(!['yes','partial','no','unassessable'].includes(value.verdict))throw Error('INVALID_IMAGE_ANSWER');
  if(!Array.isArray(value.groups)||value.groups.length>64)throw Error('INVALID_IMAGE_ANSWER');
  const groups=value.groups.map(row=>{
   if(!names.has(row.name)||row.typeConfirmed!==true)throw Error('CONFIRM_UNIT_TYPE');
   const count=row.countConfirmed===true?row.count:null;
   if(count!==null&&(!Number.isInteger(count)||count<1||count>1000))throw Error('INVALID_UNIT_COUNT');
   const forms=(row.forms??[]).map(form=>{
    if(typeof form.label!=='string'||!form.label.trim()||form.label.length>100||form.confirmed!==true)throw Error('INVALID_UNIT_FORM');
    const n=form.countConfirmed===true?form.count:null;
    if(n!==null&&(!Number.isInteger(n)||n<1||n>1000))throw Error('INVALID_UNIT_COUNT');
    return {label:form.label.trim(),language:input.language==='en'?'en':'de',count:n,confirmed:true};
   });
   if(forms.length>32||forms.reduce((sum,f)=>sum+(f.count??0),0)>(count??1000))throw Error('INVALID_UNIT_FORM');
   const box=row.box??null;
   if(box&&(!Array.isArray(box)||box.length!==4||box.some(n=>!Number.isFinite(n))||box[0]<0||box[1]<(side==='enemy'?325:1580)||box[2]>1080||box[3]>(side==='enemy'?1015:2090)||box[2]-box[0]<12||box[3]-box[1]<12||box[2]-box[0]>450||box[3]-box[1]>450))throw Error('INVALID_EXAMPLE_BOX');
   return {name:row.name,typeConfirmed:true,count,forms,box};
  });
  if(new Set(groups.map(g=>g.name)).size!==groups.length)throw Error('DUPLICATE_UNIT_TYPE');
  const complete=value.typesComplete===true;
  if(value.verdict==='unassessable'){
   if(groups.length||complete||value.emptyConfirmed)throw Error('INVALID_IMAGE_ANSWER');
  }else if(complete&&!groups.length&&value.emptyConfirmed!==true)throw Error('CONFIRM_EMPTY_FIELD');
  result.sides[side]={verdict:value.verdict,typesComplete:complete,emptyConfirmed:complete&&!groups.length&&value.emptyConfirmed===true,groups};
 }
 if(!Object.keys(result.sides).length)throw Error('INVALID_IMAGE_ANSWER');
 return result;
}
export function createImageReviewStore(withDatabase){
 const decode=row=>{if(!row)return null;const {context_json,answer_json,image,...rest}=row;return {...rest,context:JSON.parse(context_json),answer:answer_json?JSON.parse(answer_json):null};};
 async function add(game,frame,png,purpose='targeted'){
  const digest=hash(png),id=hash(game.id+':'+digest).slice(0,24);
  if(png.length>12*1024*1024)return null;
  return withDatabase(false,db=>{
   if(db.prepare("SELECT COUNT(*) n FROM image_questions WHERE answer_json IS NULL OR json_extract(answer_json,'$.sides.own') IS NULL OR json_extract(answer_json,'$.sides.enemy') IS NULL").get().n>=36)return null;
   const context={phase:frame.phase,language:frame.language??game.language??'de',geometry:frame.geometry??null,
    proposals:frame.armyObservation?.sides??{},selectionVersion:1};
   const inserted=db.prepare(`INSERT OR IGNORE INTO image_questions (id,match_id,capture_id,image_hash,created,purpose,partition,context_json,image) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id,game.id,frame.id,digest,Date.now(),purpose,fieldPartition(game.id),JSON.stringify(context),png);
   return inserted.changes?id:null;
  });
 }
 async function list(){return withDatabase(true,db=>{
  const rows=db.prepare('SELECT id,match_id,capture_id,created,purpose,partition,revision,answer_json,export_status,export_error,reference_id FROM image_questions ORDER BY created DESC,id').all();
  const items=rows.map(({answer_json,...r})=>{const sides=answer_json?JSON.parse(answer_json).sides:{};return {...r,answered:!!sides.own&&!!sides.enemy,partial:!!sides.own!==!!sides.enemy};});
  return {items,counts:{open:items.filter(r=>!r.answered).length,answered:items.filter(r=>r.answered).length,partial:items.filter(r=>r.partial).length,exportPending:rows.filter(r=>r.export_status==='pending').length,failed:rows.filter(r=>r.export_status==='failed').length}};
 });}
 async function get(id,blind=true){return withDatabase(true,db=>{const r=decode(db.prepare('SELECT * FROM image_questions WHERE id=?').get(id));if(r&&blind&&(r.purpose==='control'||r.partition==='test')){r.context.proposals={};r.blind=true;}return r;});}
 async function answer(id,revision,input,names){
  const value=validateImageAnswer(input,names);
  return withDatabase(false,db=>{
   db.exec('BEGIN IMMEDIATE');try{
    const row=db.prepare('SELECT revision,answer_json FROM image_questions WHERE id=?').get(id);
    if(!row)throw Error('IMAGE_QUESTION_NOT_FOUND');
    if(row.revision!==revision)throw Error('IMAGE_QUESTION_CHANGED');
    const json=JSON.stringify(value),next=revision+1;
    db.prepare("UPDATE image_questions SET revision=?,answer_json=?,export_status='pending',export_error=NULL WHERE id=?").run(next,json,id);
    db.prepare('INSERT INTO image_question_history VALUES (?,?,?,?)').run(id,next,Date.now(),json);
    db.exec('COMMIT');return {id,revision:next};
   }catch(e){db.exec('ROLLBACK');throw e;}
  });
 }
 async function pending(){return withDatabase(true,db=>db.prepare("SELECT id FROM image_questions WHERE export_status='pending' ORDER BY created LIMIT 1").get()?.id??null);}
 async function projected(id,revision,referenceId,error=null){return withDatabase(false,db=>db.prepare("UPDATE image_questions SET export_status=?,reference_id=?,export_error=?,image=CASE WHEN ? THEN image ELSE x'' END WHERE id=? AND revision=?").run(error?'failed':'done',referenceId,error,!!error?1:0,id,revision));}
 async function image(id){return withDatabase(true,db=>{const b=db.prepare('SELECT image FROM image_questions WHERE id=?').get(id)?.image;return b?.length?Buffer.from(b):null;});}
 async function retry(id){return withDatabase(false,db=>db.prepare("UPDATE image_questions SET export_status='pending',export_error=NULL WHERE id=? AND answer_json IS NOT NULL").run(id));}
 return {add,list,get,answer,pending,projected,image,retry};
}
