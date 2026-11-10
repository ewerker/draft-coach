import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const canonical=n=>n==='Verwüster'?'Zerstörer':n==='Bientank'?'Bienenkorb':n;
const normalize=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('de');
const number=n=>Number.isInteger(n)&&n>=0&&n<=10000;
const actions=['add','upgrade','multiply','multiply_upgrade'];
export const defaultMechanisms=Object.freeze(actions.map(action=>Object.freeze({id:'source-only-'+action,unit:'*',action,scope:'source_only',factor:2,
 status:action==='multiply_upgrade'?'candidate':'confirmed',evidence:'Rechenmodell: nur die ausdrücklich bestätigte Ausgangsform. Kombinierte Spielbedeutung gesondert bestätigen.',revision:1})));
export const formMechanicsSchema=`CREATE TABLE IF NOT EXISTS evolution_forms (
 id TEXT PRIMARY KEY,unit TEXT NOT NULL,labels TEXT NOT NULL,evidence TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS evolution_mechanisms (id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS evolution_inventory (id TEXT PRIMARY KEY,match_id TEXT NOT NULL,capture INTEGER NOT NULL,side TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(match_id,capture,side));
 CREATE TABLE IF NOT EXISTS evolution_bindings (match_id TEXT NOT NULL,capture INTEGER NOT NULL,position INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(match_id,capture,position));
 CREATE TABLE IF NOT EXISTS evolution_history (id INTEGER PRIMARY KEY,kind TEXT NOT NULL,record_id TEXT NOT NULL,at INTEGER NOT NULL,data TEXT NOT NULL);`;

export function calculateFormEffect({offer,inventory,binding,forms=[],mechanisms=defaultMechanisms,matchId,captureId}){
 const unknown=reason=>({known:false,reason,affectedCount:null,addedCount:null,sourceFormId:binding?.sourceFormId??null,targetFormId:binding?.targetFormId??null});
 if(!actions.includes(offer?.action))return unknown('unknown_action');
 if(!inventory||inventory.actor!=='player'||inventory.side!=='own'||inventory.matchId!==matchId||inventory.captureId!==captureId)return unknown('unconfirmed_inventory');
 if(!binding?.confirmed||binding.actor!=='player'||binding.scopeConfirmed!==true)return unknown('unconfirmed_form_binding');
 const name=canonical(offer.name),unit=inventory.units.find(u=>u.name===name);
 if(!unit)return unknown('unknown_unit_stock');
 const source=binding.sourceFormId,target=offer.action==='multiply'?source:binding.targetFormId;
 const catalog=new Map(forms.map(f=>[f.id,f]));
 if((offer.action!=='add'&&catalog.get(source)?.unit!==name)||catalog.get(target)?.unit!==name)return unknown('unknown_form');
 const candidates=mechanisms.filter(m=>m.action===offer.action&&(m.unit==='*'||m.unit===name)&&(!m.sourceFormId||m.sourceFormId===source)&&(!m.targetFormId||m.targetFormId===target));
 if(candidates.some(m=>m.status==='conflict'))return unknown('conflicting_mechanism');
 const mechanism=candidates.find(m=>m.id===binding.mechanismId)??candidates.find(m=>m.unit===name)??candidates.find(m=>m.unit==='*');
 if(!mechanism||mechanism.status!=='confirmed'||mechanism.scope!=='source_only')return unknown('unconfirmed_mechanism');
 const entries=unit.forms??[],knownCounts=entries.filter(f=>number(f.count)),sum=knownCounts.reduce((s,f)=>s+f.count,0);
 if(new Set(entries.map(f=>f.formId)).size!==entries.length||unit.totalCount!=null&&(!number(unit.totalCount)||sum>unit.totalCount))return unknown('conflicting_counts');
 const sourceRow=entries.find(f=>f.formId===source);
 if(offer.action!=='add'&&!number(sourceRow?.count))return unknown('unknown_source_count');
 if(['upgrade','multiply_upgrade'].includes(offer.action)&&source===target)return unknown('unknown_transition');
 if(offer.action==='add'&&(!Number.isInteger(offer.quantity)||offer.quantity<1||offer.quantity>1000))return unknown('unknown_quantity');
 if(['multiply','multiply_upgrade'].includes(offer.action)&&(offer.quantity??2)!==2)return unknown('unknown_factor');
 const affected=offer.action==='add'?0:sourceRow.count;
 const produced=offer.action==='add'?offer.quantity:affected*(['multiply','multiply_upgrade'].includes(offer.action)?2:1);
 const delta=offer.action==='add'?produced:produced-affected;
 const after=structuredClone(inventory),next=after.units.find(u=>u.name===name);
 if(offer.action!=='add')next.forms.find(f=>f.formId===source).count=0;
 let destination=next.forms.find(f=>f.formId===target);
 if(!destination){
  const allAssigned=number(unit.totalCount)&&knownCounts.length===entries.length&&sum===unit.totalCount;
  destination={formId:target,count:allAssigned?0:null};next.forms.push(destination);
 }
 destination.count=destination.count==null?null:destination.count+produced;
 next.totalCount=next.totalCount==null?null:next.totalCount+delta;
 return {known:true,reason:'confirmed_source_only',mechanismId:mechanism.id,affectedCount:affected,addedCount:delta,sourceFormId:source??null,targetFormId:target,
  beforeTotal:unit.totalCount??null,afterTotal:next.totalCount,after,expectedOnly:true};
}

export function validateMechanism(data,forms){
 const allowed=new Set(['id','revision','unit','action','sourceFormId','targetFormId','scope','factor','status','evidence']);
 if(!data||Object.keys(data).some(k=>!allowed.has(k))||!actions.includes(data.action)||data.scope!=='source_only'||!['candidate','confirmed','conflict'].includes(data.status)||typeof data.evidence!=='string'||!data.evidence.trim()||data.evidence.length>1500||data.factor!==undefined&&data.factor!==2)throw Error('INVALID_MECHANISM');
 const unit=canonical(data.unit);
 if(unit!=='*'){
  if(data.action!=='add'&&!forms.some(f=>f.id===data.sourceFormId&&f.unit===unit))throw Error('UNKNOWN_SOURCE_FORM');
  if(!forms.some(f=>f.id===data.targetFormId&&f.unit===unit))throw Error('UNKNOWN_TARGET_FORM');
 }
 if(unit==='*'&&(data.sourceFormId||data.targetFormId))throw Error('INVALID_MECHANISM');
 return {id:data.id??'m-'+hash([unit,data.action,data.sourceFormId,data.targetFormId]).slice(0,24),unit,action:data.action,scope:'source_only',factor:2,status:data.status,
  sourceFormId:data.sourceFormId??null,targetFormId:data.targetFormId??null,evidence:data.evidence.trim(),actor:'player'};
}

export function createFormMechanicsStore(withDatabase){
 const formsFrom=db=>db.prepare('SELECT * FROM evolution_forms ORDER BY unit,id').all().map(f=>({...f,labels:JSON.parse(f.labels),evidence:JSON.parse(f.evidence)}));
 const mechanismsFrom=db=>{
  const custom=db.prepare('SELECT data,revision FROM evolution_mechanisms').all().map(m=>({...JSON.parse(m.data),revision:m.revision}));
  return [...defaultMechanisms.filter(m=>!custom.some(c=>c.id===m.id)),...custom];
 };
 const history=(db,kind,id,data)=>db.prepare('INSERT INTO evolution_history(kind,record_id,at,data) VALUES(?,?,?,?)').run(kind,id,Date.now(),JSON.stringify(data));
 async function syncReferences(references){return withDatabase(false,db=>{
  const forms=formsFrom(db);let added=0,snapshots=0;
  const latest=new Map();
  for(const ref of references)for(const side of ['own','enemy'])if(ref.fieldConfirmations?.[side]?.actor==='player'){
   const key=JSON.stringify([ref.matchId,ref.captureId,side]),previous=latest.get(key);
   if(!previous||(ref.fieldConfirmations[side].confirmedAt??ref.at??0)>(previous.fieldConfirmations[side].confirmedAt??previous.at??0))latest.set(key,ref);
  }
  db.exec('BEGIN IMMEDIATE');try{
   for(const ref of references)if(ref.matchId&&Number.isSafeInteger(ref.captureId))for(const side of ['own','enemy']){
    const confirmation=ref.fieldConfirmations?.[side];if(confirmation?.actor!=='player'||latest.get(JSON.stringify([ref.matchId,ref.captureId,side]))!==ref)continue;
    const units=[];
    for(const g of confirmation.groups??[])if(g.typeConfirmed){
     const unit=canonical(g.name),knownForms=[];
     for(const f of g.forms??[])if(f.confirmed&&f.label?.trim()){
      const language=f.language==='en'?'en':'de',label=f.label.trim();
      const descriptionKey=hash([ref.id,side,unit,language,normalize(label)]);
      let form=forms.find(x=>x.unit===unit&&(x.evidence.some(p=>p.descriptionKey===descriptionKey)||x.labels[language]&&normalize(x.labels[language])===normalize(label)));
      if(!form){form={id:'f-'+hash([unit,language,normalize(label)]).slice(0,24),unit,labels:{[language]:label},evidence:[],revision:1};forms.push(form);added++;}
      const proof={referenceId:ref.id,questionId:confirmation.questionId,revision:confirmation.revision,matchId:ref.matchId,captureId:ref.captureId,side,descriptionKey};
      if(!form.evidence.some(p=>p.descriptionKey===descriptionKey))form.evidence.push(proof);
      form.evidence=form.evidence.slice(-100);
      db.prepare('INSERT INTO evolution_forms VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET evidence=excluded.evidence').run(form.id,unit,JSON.stringify(form.labels),JSON.stringify(form.evidence),form.revision);
      knownForms.push({formId:form.id,count:number(f.count)?f.count:null});
     }
     units.push({name:unit,totalCount:number(g.count)?g.count:null,forms:knownForms});
    }
    const value={actor:'player',matchId:ref.matchId,captureId:ref.captureId,side,referenceId:ref.id,questionId:confirmation.questionId,revision:confirmation.revision,typesComplete:confirmation.typesComplete===true,units};
    const id='i-'+hash([ref.matchId,ref.captureId,side]).slice(0,24),serialized=JSON.stringify(value);
    const previous=db.prepare('SELECT data FROM evolution_inventory WHERE id=?').get(id);
    if(previous?.data!==serialized){db.prepare('INSERT INTO evolution_inventory VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(id,ref.matchId,ref.captureId,side,serialized);history(db,'inventory',id,value);snapshots++;}
   }
   // Withdraw only derived snapshots when their source confirmation was removed.
   const valid=new Set(references.flatMap(ref=>['own','enemy'].filter(side=>ref.fieldConfirmations?.[side]?.actor==='player').map(side=>'i-'+hash([ref.matchId,ref.captureId,side]).slice(0,24))));
   for(const row of db.prepare('SELECT id,data FROM evolution_inventory').all())if(!valid.has(row.id)){history(db,'withdrawn_inventory',row.id,JSON.parse(row.data));db.prepare('DELETE FROM evolution_inventory WHERE id=?').run(row.id);}
   db.exec('COMMIT');return {added,snapshots};
  }catch(e){db.exec('ROLLBACK');throw e;}
 });}
 async function list(){return withDatabase(true,db=>({revision:db.prepare('SELECT coalesce(max(id),0) n FROM evolution_history').get().n,forms:formsFrom(db),mechanisms:mechanismsFrom(db),inventories:db.prepare('SELECT id,match_id,capture,side,data FROM evolution_inventory ORDER BY capture DESC LIMIT 100').all().map(r=>({...r,data:JSON.parse(r.data)}))}));}
 async function updateForm({id,revision,labels}){return withDatabase(false,db=>{
  const row=db.prepare('SELECT * FROM evolution_forms WHERE id=?').get(id);if(!row||row.revision!==revision)throw Error('FORM_CHANGED');
  if(!labels||Object.keys(labels).some(k=>!['de','en'].includes(k))||Object.values(labels).some(s=>typeof s!=='string'||s.length>100)||!Object.values(labels).some(s=>s.trim()))throw Error('INVALID_FORM_LABEL');
  const next=Object.fromEntries(Object.entries(labels).filter(([,s])=>s.trim()).map(([l,s])=>[l,s.trim()]));
  if(formsFrom(db).some(f=>f.id!==id&&f.unit===row.unit&&Object.entries(next).some(([l,s])=>f.labels[l]&&normalize(f.labels[l])===normalize(s))))throw Error('AMBIGUOUS_FORM_LABEL');
  db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE evolution_forms SET labels=?,revision=revision+1 WHERE id=?').run(JSON.stringify(next),id);history(db,'form',id,{before:JSON.parse(row.labels),labels:next});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 });}
 async function recordMechanism(data){return withDatabase(false,db=>{
  const value=validateMechanism(data,formsFrom(db)),old=db.prepare('SELECT * FROM evolution_mechanisms WHERE id=?').get(value.id);
  const previousRevision=old?.revision??defaultMechanisms.find(m=>m.id===value.id)?.revision??0;
  if(previousRevision&&data.revision!==previousRevision)throw Error('MECHANISM_CHANGED');
  db.exec('BEGIN IMMEDIATE');try{
   const revision=previousRevision+1;db.prepare('INSERT INTO evolution_mechanisms VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision').run(value.id,JSON.stringify(value),revision);history(db,'mechanism',value.id,{...value,revision});db.exec('COMMIT');return {...value,revision};
  }catch(e){db.exec('ROLLBACK');throw e;}
 });}
 async function context(matchId,capture){return withDatabase(true,db=>{
  const stock=db.prepare("SELECT data FROM evolution_inventory WHERE match_id=? AND capture=? AND side='own'").get(matchId,capture);
  const bindings=db.prepare('SELECT position,data FROM evolution_bindings WHERE match_id=? AND capture=?').all(matchId,capture);
  return {formInventory:stock?JSON.parse(stock.data):null,formBindings:Object.fromEntries(bindings.map(b=>[b.position,JSON.parse(b.data)])),formCatalog:formsFrom(db),mechanisms:mechanismsFrom(db)};
 });}
 async function bind({matchId,capture,position,sourceFormId,targetFormId,mechanismId,confirmed}){
  if(typeof matchId!=='string'||!Number.isSafeInteger(capture)||!Number.isInteger(position)||position<0||position>3||confirmed!==true)throw Error('INVALID_FORM_BINDING');
  return withDatabase(false,db=>{const data={sourceFormId:sourceFormId||null,targetFormId:targetFormId||null,mechanismId:mechanismId||null,confirmed:true,scopeConfirmed:true,actor:'player'};
   const forms=formsFrom(db);if([data.sourceFormId,data.targetFormId].some(id=>id&&!forms.some(f=>f.id===id)))throw Error('UNKNOWN_FORM');
   db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO evolution_bindings VALUES(?,?,?,?) ON CONFLICT(match_id,capture,position) DO UPDATE SET data=excluded.data').run(matchId,capture,position,JSON.stringify(data));history(db,'binding',[matchId,capture,position].join(':'),data);db.exec('COMMIT');return data;}catch(e){db.exec('ROLLBACK');throw e;}
  });
 }
 return {syncReferences,list,updateForm,recordMechanism,context,bind};
}
