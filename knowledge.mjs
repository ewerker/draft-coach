import {createHash,randomUUID} from 'node:crypto';

export const knowledgeSchema=`
CREATE TABLE IF NOT EXISTS knowledge_items (
 id TEXT PRIMARY KEY, created INTEGER NOT NULL, kind TEXT NOT NULL,
 workflow TEXT NOT NULL DEFAULT 'collected', reviewed INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1, redirect TEXT REFERENCES knowledge_items(id)
);
CREATE TABLE IF NOT EXISTS knowledge_sources (
 source_key TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES knowledge_items(id),
 type TEXT NOT NULL, source_id TEXT NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL,
 available INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS knowledge_history (
 id INTEGER PRIMARY KEY, item_id TEXT NOT NULL REFERENCES knowledge_items(id),
 created INTEGER NOT NULL, event TEXT NOT NULL, data TEXT NOT NULL
);
`;
export const knowledgeKinds=['tactic','mechanic','recognition'];
export const knowledgeWorkflows=['collected','needs_answer','ready','checking','more_evidence','proposed','active','deferred'];
const editableWorkflows=['collected','needs_answer','ready','more_evidence','deferred'];
const fingerprint=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
const identity=(type,id)=>'k-'+fingerprint([type,id]).slice(0,24);
const parse=text=>JSON.parse(text);
const languages=['de','en'];
const validTime=value=>Number.isSafeInteger(value)&&value>=0;
function textsOf(rule){
  if(rule.texts)return rule.texts;
  return {[rule.textLanguage==='en'?'en':'de']:{title:rule.title??'',reason:rule.reason??''}};
}

// The source stores remain authoritative. Synchronization only adds a provenance layer.
export function knowledgeSources({rules=[],cases=[],references=[],findings=[]}){
  return [
    ...rules.map(rule=>({type:'rule',id:rule.id,kind:rule.kind==='mechanic'?'mechanic':'tactic',
      data:{texts:textsOf(rule),language:rule.textLanguage??'de',status:rule.status,
        offer:rule.offer??'',enemy:rule.enemy??'',action:rule.action??'',condition:rule.condition??'',mode:rule.mode,phase:rule.phase,weight:rule.weight,
        evidence:rule.evidence??[],origin:rule.source??'tactics',original:rule}})),
    ...cases.map(item=>({type:'case',id:item.id,kind:item.template?'recognition':item.rule?.kind==='mechanic'?'mechanic':'tactic',
      created:item.created,ruleId:item.revision?.ruleId??null,reviewed:item.reviewed,
      data:{texts:item.rule?textsOf(item.rule):{},language:item.rule?.textLanguage??item.language??item.template?.language??null,
        offer:item.rule?.offer??'',enemy:item.rule?.enemy??'',action:item.rule?.action??'',condition:item.rule?.condition??'',mode:item.rule?.mode,phase:item.rule?.phase,
        observation:item.observation??'',matchId:item.matchId,capture:item.capture,origin:'match_review',original:item}})),
    ...references.map(ref=>({type:'reference',id:ref.id,kind:'recognition',created:ref.at,
      data:{texts:{},language:ref.language??null,matchId:ref.matchId,capture:ref.captureId,
        origin:ref.source??'reference',issues:ref.issues??[],corrections:ref.corrections??[],complete:ref.complete??{},original:ref}})),
    ...findings.map(finding=>{
      let details={};try{details=parse(finding.details_json??'{}');}catch{}
      // The original archive predates language metadata and was written in German.
      const language=languages.includes(details.language)?details.language:'de';
      return {type:'finding',id:finding.id,kind:'tactic',data:{texts:details.texts??{[language]:{title:finding.titel??'',reason:finding.beobachtung??''}},language,
        languageOrigin:details.language?'recorded':'legacy_de',
        observation:finding.beobachtung??'',title:finding.titel??'',origin:'archive',details,original:finding,
        evidence:finding.evidence??[]}};
    })
  ];
}

export function createKnowledgeStore(withDatabase){
  const history=(db,id,event,data)=>db.prepare('INSERT INTO knowledge_history (item_id,created,event,data) VALUES (?,?,?,?)')
    .run(id,Date.now(),event,JSON.stringify(data));
  function transaction(db,operation){
    db.exec('BEGIN IMMEDIATE');
    try{const result=operation();db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  async function sync(input){
    const sources=knowledgeSources(input);
    return withDatabase(false,db=>transaction(db,()=>{
      const seen=new Set();
      const lookup=db.prepare('SELECT * FROM knowledge_sources WHERE source_key=?');
      const addItem=db.prepare('INSERT OR IGNORE INTO knowledge_items (id,created,kind,reviewed) VALUES (?,?,?,?)');
      const upsert=db.prepare(`INSERT INTO knowledge_sources (source_key,item_id,type,source_id,fingerprint,data)
        VALUES (?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET item_id=excluded.item_id,
          fingerprint=excluded.fingerprint,data=excluded.data,available=1`);
      for(const source of sources){
        if(typeof source.id!=='string'||!source.id)throw Error('Source identifier missing');
        const key=JSON.stringify([source.type,source.id]);seen.add(key);
        const old=lookup.get(key);
        const target=source.type==='case'&&source.ruleId&&input.rules?.some(rule=>rule.id===source.ruleId)?identity('rule',source.ruleId):old?.item_id??identity(source.type,source.id);
        addItem.run(target,validTime(source.created)?source.created:Date.now(),source.kind,source.reviewed===true?1:0);
        // An explicit case-to-rule link joins their provenance without deleting either original.
        if(old&&old.item_id!==target){
          db.prepare('UPDATE knowledge_sources SET item_id=? WHERE item_id=?').run(target,old.item_id);
          db.prepare('UPDATE knowledge_items SET redirect=? WHERE id=?').run(target,old.item_id);
          history(db,target,'linked',{previousId:old.item_id,source:key});
        }
        const hash=fingerprint(source.data);
        if(!old||old.fingerprint!==hash||!old.available||old.item_id!==target){
          upsert.run(key,target,source.type,source.id,hash,JSON.stringify(source.data));
          if(source.type==='case'&&old&&parse(old.data).original?.reviewed!==source.data.original?.reviewed)
            db.prepare('UPDATE knowledge_items SET reviewed=? WHERE id=?').run(source.reviewed===true?1:0,target);
          if(old)db.prepare('UPDATE knowledge_items SET revision=revision+1 WHERE id=?').run(target);
          history(db,target,old?'source_updated':'source_imported',{source:key,data:source.data});
        }
      }
      for(const old of db.prepare("SELECT * FROM knowledge_sources WHERE type!='manual' AND available=1").all()){
        if(seen.has(old.source_key))continue;
        db.prepare('UPDATE knowledge_sources SET available=0 WHERE source_key=?').run(old.source_key);
        db.prepare('UPDATE knowledge_items SET revision=revision+1 WHERE id=?').run(old.item_id);
        history(db,old.item_id,'source_unavailable',{source:old.source_key});
      }
      return {sources:sources.length};
    }));
  }
  function resolve(db,id){
    let item=db.prepare('SELECT * FROM knowledge_items WHERE id=?').get(id);
    const seen=new Set();
    while(item?.redirect){
      if(seen.has(item.id))throw Error('Invalid knowledge link');seen.add(item.id);
      item=db.prepare('SELECT * FROM knowledge_items WHERE id=?').get(item.redirect);
    }
    if(!item)throw Error('Prüfauftrag nicht gefunden.');return item;
  }
  async function list(){
    return withDatabase(true,db=>{
      const items=db.prepare('SELECT * FROM knowledge_items WHERE redirect IS NULL ORDER BY created DESC,id').all();
      const sources=db.prepare('SELECT * FROM knowledge_sources ORDER BY source_key').all();
      const rows=items.map(item=>{
        const provenance=sources.filter(source=>source.item_id===item.id).map(source=>({type:source.type,id:source.source_id,available:Boolean(source.available),...parse(source.data)}));
        const rule=provenance.find(source=>source.type==='rule'&&source.available);
        const primary=rule??provenance.find(source=>source.type==='manual')??provenance.find(source=>source.available)??provenance[0];
        const texts={...primary?.texts};
        for(const source of provenance)for(const locale of languages)if(!texts[locale]&&source.texts?.[locale])texts[locale]=source.texts[locale];
        return {id:item.id,created:item.created,kind:item.kind,workflow:rule?.status==='aktiv'?'active':item.workflow,
          reviewed:Boolean(item.reviewed),revision:item.revision,texts,sources:provenance,
          ruleStatus:rule?.status??null,scope:primary?.offer||'all',duplicates:[]};
      });
      // Only suggest exact content duplicates with the same logical scope; never silently merge them.
      const groups=new Map();
      for(const row of rows){
        const source=row.sources.find(s=>s.type==='rule')??row.sources.find(s=>s.type==='manual');
        if(!source)continue;
        const key=fingerprint([row.kind,Object.fromEntries(languages.map(l=>[l,row.texts[l]?{
          title:row.texts[l].title?.trim().toLocaleLowerCase(),reason:row.texts[l].reason?.trim().toLocaleLowerCase()}:null])),
          source.offer??'',source.enemy??'',source.action??'',source.condition??'',source.mode??'',source.phase??'']);
        const group=groups.get(key)??[];group.push(row);groups.set(key,group);
      }
      for(const group of groups.values())if(group.length>1)for(const row of group)row.duplicates=group.filter(other=>other.id!==row.id).map(other=>other.id);
      return {schemaVersion:1,items:rows,counts:{total:rows.length,open:rows.filter(row=>!row.reviewed).length,
        done:rows.filter(row=>row.reviewed).length,active:rows.filter(row=>row.workflow==='active').length}};
    });
  }
  async function update({id,revision,...patch}){
    if(Object.keys(patch).some(key=>!['kind','workflow','reviewed'].includes(key))||
      patch.kind!==undefined&&!knowledgeKinds.includes(patch.kind)||
      patch.workflow!==undefined&&!editableWorkflows.includes(patch.workflow)||
      patch.reviewed!==undefined&&typeof patch.reviewed!=='boolean')throw Error('Ungültiger Bearbeitungsstatus.');
    return withDatabase(false,db=>transaction(db,()=>{
      const item=resolve(db,id);
      if(revision!==item.revision)throw Error('Dieser Prüfauftrag wurde geändert. Bitte aktualisieren.');
      db.prepare('UPDATE knowledge_items SET kind=?,workflow=?,reviewed=?,revision=revision+1 WHERE id=?')
        .run(patch.kind??item.kind,patch.workflow??item.workflow,patch.reviewed===undefined?item.reviewed:Number(patch.reviewed),item.id);
      history(db,item.id,'work_updated',{before:{kind:item.kind,workflow:item.workflow,reviewed:Boolean(item.reviewed)},patch});
      return {id:item.id};
    }));
  }
  async function create({kind,language,title,reason}){
    if(!knowledgeKinds.includes(kind)||!languages.includes(language)||typeof title!=='string'||!title.trim()||title.length>100||
       typeof reason!=='string'||!reason.trim()||reason.length>1500)throw Error('Bitte Titel und Beobachtung prüfen.');
    const id=randomUUID(),created=Date.now();
    const data={texts:{[language]:{title:title.trim(),reason:reason.trim()}},language,origin:'manual',scope:'all'};
    await withDatabase(false,db=>transaction(db,()=>{
      db.prepare('INSERT INTO knowledge_items (id,created,kind) VALUES (?,?,?)').run(id,created,kind);
      db.prepare('INSERT INTO knowledge_sources (source_key,item_id,type,source_id,fingerprint,data) VALUES (?,?,?,?,?,?)')
        .run(JSON.stringify(['manual',id]),id,'manual',id,fingerprint(data),JSON.stringify(data));
      history(db,id,'created',{data,kind});
    }));
    return {id};
  }
  async function revisions(id){
    return withDatabase(true,db=>{
      const item=resolve(db,id);
      const aliases=db.prepare('SELECT id,redirect FROM knowledge_items WHERE redirect IS NOT NULL').all();
      const ids=new Set([item.id]);let changed=true;
      while(changed){changed=false;for(const alias of aliases)if(ids.has(alias.redirect)&&!ids.has(alias.id)){ids.add(alias.id);changed=true;}}
      return db.prepare('SELECT * FROM knowledge_history ORDER BY id').all().filter(row=>ids.has(row.item_id))
        .map(row=>({...row,data:parse(row.data)}));
    });
  }
  async function edit({id,revision,language,title,reason}){
    if(!languages.includes(language)||typeof title!=='string'||!title.trim()||title.length>100||typeof reason!=='string'||!reason.trim()||reason.length>1500)
      throw Error('Bitte Titel und Beobachtung prüfen.');
    return withDatabase(false,db=>transaction(db,()=>{
      const item=resolve(db,id);
      if(item.revision!==revision)throw Error('Dieser Prüfauftrag wurde geändert. Bitte aktualisieren.');
      const source=db.prepare("SELECT * FROM knowledge_sources WHERE item_id=? AND type='manual'").get(item.id);
      if(!source)throw Error('Diesen Eintrag bitte im Original bearbeiten.');
      const data=parse(source.data),other=language==='de'?'en':'de';
      const previous=data.texts[language];
      if(previous&&data.texts[other]&&(previous.title!==title.trim()||previous.reason!==reason.trim()))
        data.texts[other]={...data.texts[other],stale:true};
      data.texts[language]={title:title.trim(),reason:reason.trim()};
      db.prepare('UPDATE knowledge_sources SET data=?,fingerprint=? WHERE source_key=?').run(JSON.stringify(data),fingerprint(data),source.source_key);
      db.prepare('UPDATE knowledge_items SET revision=revision+1 WHERE id=?').run(item.id);
      history(db,item.id,'source_updated',{source:source.source_key,data});return {id:item.id};
    }));
  }
  async function findings(){
    return withDatabase(true,db=>db.prepare(`SELECT e.* FROM erkenntnisse e ORDER BY rowid DESC`).all().map(row=>({...row,
      evidence:db.prepare('SELECT aufnahme FROM erkenntnis_beleg WHERE erkenntnis_id=? ORDER BY reihenfolge').all(row.id).map(ref=>ref.aufnahme)})));
  }
  return {sync,list,update,create,edit,revisions,findings};
}
