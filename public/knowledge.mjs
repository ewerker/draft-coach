import {displayNames} from './language.mjs';
export const knowledgeLabels={
  de:{title:'Wissen und Prüfaufträge',intro:'Alle Quellen an einer Stelle. Bearbeitet bedeutet nicht automatisch geprüft oder als Regel aktiv.',
    refresh:'Aktualisieren',search:'Aufträge durchsuchen',all:'Alle',open:'Offen',done:'Bearbeitet',kind:'Art',stage:'Prüfstand',work:'Bearbeitung',
    tactic:'Taktik',mechanic:'Spielmechanik',recognition:'Erkennung',collected:'Gesammelt',needs_answer:'Rückfrage nötig',ready:'Prüfbar',
    checking:'Prüfung läuft',more_evidence:'Weitere Belege nötig',proposed:'Freigabe vorgeschlagen',active:'Aktiv',deferred:'Zurückgestellt',
    origin:'Herkunft',sources:'Herkunft und Originale',rule:'Taktikregel',case:'Partie-Prüffall',reference:'Prüfbild',finding:'Archivbeobachtung',manual:'Eigene Beobachtung',
    scope:'Geltungsbereich',allCards:'Alle Karten / noch nicht eingeschränkt',ruleState:'Regelstatus',notiz:'Notiz',test:'Testvorschau',aktiv:'Aktiv',
    missing:'Für diese Sprache fehlt noch ein Text. Das Original steht unter Herkunft.',unavailable:'Original nicht mehr im Quellspeicher; letzte Fassung erhalten',
    openSource:'Original öffnen',history:'Verlauf anzeigen',duplicate:'Mögliche Doppelung – Originale bleiben erhalten',mark:'Als bearbeitet markieren',reopen:'Wieder öffnen',
    new:'Beobachtung hinzufügen',heading:'Titel',reason:'Beobachtung',save:'Beobachtung speichern',saved:'Gespeichert.',
    note:'Neue Beobachtungen werden gesammelt. Eine allgemeine Mechanik braucht keine Einzelkarte und kein Punktgewicht. Die automatische Prüfung folgt im weiteren Ausbau.',
    empty:'Keine passenden Prüfaufträge.',previous:'Zurück',next:'Weiter',loading:'Quellen werden zusammengeführt …',original:'Original',
    total:'insgesamt',activeCount:'aktive Regeln',version:'Version',sourceLanguage:'Sprache des Originals',unknown:'unbekannt',
    reserved:'Automatische Prüfung und Freigabevorschläge folgen in den nächsten Ausbauschritten.',
    source_imported:'Quelle übernommen',source_updated:'Quelle aktualisiert',source_unavailable:'Quelle entfernt; Beleg erhalten',linked:'Quellen verknüpft',created:'Beobachtung angelegt',work_updated:'Bearbeitungsstand geändert'},
  en:{title:'Knowledge and review tasks',intro:'All sources in one place. Marking a task done does not verify it or activate a rule.',
    refresh:'Refresh',search:'Search tasks',all:'All',open:'Open',done:'Done',kind:'Type',stage:'Review stage',work:'Work status',
    tactic:'Tactics',mechanic:'Game mechanic',recognition:'Recognition',collected:'Collected',needs_answer:'Question needed',ready:'Ready to check',
    checking:'Checking',more_evidence:'More evidence needed',proposed:'Activation proposed',active:'Active',deferred:'Deferred',
    origin:'Source',sources:'Sources and originals',rule:'Tactical rule',case:'Match review case',reference:'Review image',finding:'Archived observation',manual:'Player observation',
    scope:'Scope',allCards:'All cards / not narrowed down yet',ruleState:'Rule status',notiz:'Note',test:'Shadow preview',aktiv:'Active',
    missing:'No text in this language yet. The original is available under Sources.',unavailable:'Original no longer in its source store; last version retained',
    openSource:'Open original',history:'Show history',duplicate:'Possible duplicate – originals are preserved',mark:'Mark done',reopen:'Reopen',
    new:'Add an observation',heading:'Title',reason:'Observation',save:'Save observation',saved:'Saved.',
    note:'New observations are collected. A general mechanic needs no specific card or point weight. Automatic checks will follow in later work packages.',
    empty:'No matching review tasks.',previous:'Previous',next:'Next',loading:'Consolidating sources…',original:'Original',
    total:'total',activeCount:'active rules',version:'Version',sourceLanguage:'Original language',unknown:'unknown',
    reserved:'Automatic checks and activation proposals will follow in subsequent work packages.',
    source_imported:'Source imported',source_updated:'Source updated',source_unavailable:'Source removed; evidence retained',linked:'Sources linked',created:'Observation created',work_updated:'Work status updated'}
};
export function knowledgeText(item,locale){
  const text=item.texts?.[locale];
  if(text)return text;
  const ref=item.sources.find(s=>s.type==='reference');
  if(ref){
    const names=[...new Set((ref.corrections??[]).map(c=>c.name).filter(Boolean))];
    return {title:(locale==='en'?'Review image':'Prüfbild')+' · '+(ref.capture??'#'+ref.id.slice(0,8)),
      reason:(locale==='en'?'Saved corrections: ':'Gespeicherte Korrekturen: ')+(ref.corrections??[]).length+(names.length?' · '+names.map(name=>displayNames(name,locale)).join(', '):'')};
  }
  const source=item.sources.find(s=>s.language===locale&&(s.observation||s.title));
  return source?{title:source.title||source.observation?.slice(0,95),reason:source.observation}:null;
}

export function createKnowledgePanel({root,getLanguage,post,onOpen}){
  let data={items:[],counts:{}},page=0,busy=false,error='',search='',kind='',stage='',work='open',origin='';
  const drafts=new Map(),editDrafts=new Map();
  const expanded=new Set(),histories=new Map();
  const element=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
  const button=(label,run)=>{const node=element('button',label,'small');node.type='button';node.onclick=()=>void perform(run);return node;};
  async function perform(run){
    if(busy)return;busy=true;error='';
    try{await run();}catch(e){error=e.message;}finally{busy=false;render();}
  }
  async function load(){
    if(busy)return;
    await perform(async()=>{
      const response=await fetch('/api/admin/knowledge');const next=await response.json();
      if(!response.ok)throw Error(next.error);data=next;
    });
  }
  function render(){
    const locale=getLanguage(),en=locale==='en',t=knowledgeLabels[locale];
    root.replaceChildren();
    const heading=element('div','','knowledge-heading');heading.append(element('h3',t.title),button(t.refresh,async()=>{
      const response=await fetch('/api/admin/knowledge');const next=await response.json();if(!response.ok)throw Error(next.error);data=next;
    }));root.append(heading,element('p',t.intro,'muted'));
    const count=data.counts;
    root.append(element('p',`${count.open??0} ${t.open.toLowerCase()} · ${count.done??0} ${t.done.toLowerCase()} · ${count.total??0} ${t.total} · ${count.active??0} ${t.activeCount}`,'knowledge-count'));
    const filters=element('div','','knowledge-filters');
    const field=(label,node)=>{const box=element('label',label);box.append(node);return box;};
    const input=document.createElement('input');input.type='search';input.value=search;
    input.oninput=()=>{const start=input.selectionStart;search=input.value;page=0;render();const replacement=root.querySelector('input[type=search]');replacement.focus();if(replacement.type==='text')replacement.setSelectionRange(start,start);};
    filters.append(field(t.search,input));
    const select=(label,value,values,change)=>{
      const node=document.createElement('select');for(const key of values)node.append(new Option(t[key]??t.all,key));node.value=value;
      node.onchange=()=>{change(node.value);page=0;render();};filters.append(field(label,node));
    };
    select(t.kind,kind,['','tactic','mechanic','recognition'],value=>kind=value);
    select(t.origin,origin,['','rule','case','reference','finding','manual'],value=>origin=value);
    select(t.stage,stage,['','collected','needs_answer','ready','checking','more_evidence','proposed','active','deferred'],value=>stage=value);
    select(t.work,work,['open','done',''],value=>work=value);root.append(filters);
    const visible=data.items.filter(item=>{
      const text=knowledgeText(item,locale);
      return (!kind||item.kind===kind)&&(!origin||item.sources.some(s=>s.type===origin))&&(!stage||item.workflow===stage)&&(!work||(work==='done')===item.reviewed)&&
        [item.id,text?.title,text?.reason,...item.sources.flatMap(s=>[s.id,s.matchId,s.capture])].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    });
    const pageSize=20;page=Math.min(page,Math.max(0,Math.ceil(visible.length/pageSize)-1));
    const cards=element('div','','knowledge-cards');
    for(const item of visible.slice(page*pageSize,(page+1)*pageSize)){
      const card=element('article','','knowledge-card'),text=knowledgeText(item,locale);
      const title=element('h4',text?.title||`${t[item.sources[0]?.type]??t[item.kind]} · #${item.id.slice(0,10)}`);title.dataset.reviewOriginal='';
      card.append(title,element('p',`${t[item.kind]} · ${t[item.workflow]} · ${t.version} ${item.revision} · #${item.id.slice(0,10)}`,'knowledge-meta'));
      const description=element('p',text?.reason||t.missing,'knowledge-description');description.dataset.reviewOriginal='';card.append(description);
      if(text?.stale)card.append(element('p',en?'Translation needs review.':'Übersetzung muss geprüft werden.','muted'));
      card.append(element('p',`${t.scope}: ${item.scope==='all'?t.allCards:displayNames(item.scope,locale)}`,'muted'));
      if(item.ruleStatus)card.append(element('p',`${t.ruleState}: ${t[item.ruleStatus]}`,'muted'));
      if(item.duplicates.length)card.append(element('p',`${t.duplicate}: ${item.duplicates.map(id=>'#'+id.slice(0,10)).join(', ')}`,'muted'));
      const controls=element('div','','knowledge-actions');
      controls.append(button(item.reviewed?t.reopen:t.mark,async()=>{
        data=await post('/api/admin/knowledge/update',{id:item.id,revision:item.revision,reviewed:!item.reviewed});
      }));
      const typeSelect=document.createElement('select');typeSelect.setAttribute('aria-label',t.kind);
      for(const value of ['tactic','mechanic','recognition'])typeSelect.append(new Option(t[value],value));typeSelect.value=item.kind;
      typeSelect.onchange=()=>void perform(async()=>{data=await post('/api/admin/knowledge/update',{id:item.id,revision:item.revision,kind:typeSelect.value});});
      const statusSelect=document.createElement('select');statusSelect.setAttribute('aria-label',t.stage);
      for(const value of ['collected','needs_answer','ready','more_evidence','deferred'])statusSelect.append(new Option(t[value],value));
      if(item.workflow==='active'){statusSelect.append(new Option(t.active,'active'));statusSelect.disabled=true;}
      statusSelect.value=item.workflow;statusSelect.onchange=()=>void perform(async()=>{data=await post('/api/admin/knowledge/update',{id:item.id,revision:item.revision,workflow:statusSelect.value});});
      controls.append(field(t.kind,typeSelect),field(t.stage,statusSelect));card.append(controls);
      const details=document.createElement('details');details.open=expanded.has(item.id);details.append(element('summary',t.sources));
      details.ontoggle=()=>details.open?expanded.add(item.id):expanded.delete(item.id);
      for(const source of item.sources){
        const row=element('div','','knowledge-source');
        row.append(element('strong',`${t[source.type]} · ${source.id}`));
        row.append(element('p',`${t.sourceLanguage}: ${source.language??t.unknown}${source.matchId?' · #'+source.matchId.slice(0,8):''}${source.capture?' · '+source.capture:''}`,'muted'));
        if(!source.available)row.append(element('p',t.unavailable,'muted'));
        const original=document.createElement('details');original.append(element('summary',t.original));
        const contents=element('pre',JSON.stringify(source.original??source,null,2));contents.dataset.reviewOriginal='';original.append(contents);row.append(original);
        if(source.available&&['rule','case','reference'].includes(source.type))row.append(button(t.openSource,()=>onOpen(source)));
        details.append(row);
      }
      details.append(button(t.history,async()=>{
        const response=await fetch('/api/admin/knowledge/history?id='+encodeURIComponent(item.id));const result=await response.json();
        if(!response.ok)throw Error(result.error);histories.set(item.id,result.history);expanded.add(item.id);
      }));
      if(item.sources.some(source=>source.type==='manual')){
        const edit=document.createElement('details');edit.append(element('summary',en?'Edit text in English':'Deutschen Text bearbeiten'));
        const form=document.createElement('form');form.className='knowledge-form';
        const draftKey=item.id+':'+locale,draft=editDrafts.get(draftKey)??item.texts[locale]??{};
        const titleInput=document.createElement('input');titleInput.required=true;titleInput.maxLength=100;titleInput.value=draft.title??'';
        const reasonInput=document.createElement('textarea');reasonInput.required=true;reasonInput.maxLength=1500;reasonInput.rows=3;reasonInput.value=draft.reason??'';
        titleInput.oninput=reasonInput.oninput=()=>editDrafts.set(draftKey,{title:titleInput.value,reason:reasonInput.value});
        const submit=element('button',t.save);submit.type='submit';
        form.append(field(t.heading,titleInput),field(t.reason,reasonInput),submit);
        form.onsubmit=event=>{event.preventDefault();void perform(async()=>{
          data=await post('/api/admin/knowledge/edit',{id:item.id,revision:item.revision,language:locale,title:titleInput.value,reason:reasonInput.value});
          expanded.add(item.id);histories.delete(item.id);editDrafts.delete(draftKey);
        });};edit.append(form);details.append(edit);
      }
      if(histories.has(item.id)){
        const entries=element('ol','','knowledge-history');
        for(const entry of histories.get(item.id))entries.append(element('li',`${new Date(entry.created).toLocaleString(en?'en-GB':'de-DE')} · ${t[entry.event]??entry.event}`));details.append(entries);
      }
      card.append(details);cards.append(card);
    }
    if(!visible.length)cards.append(element('p',t.empty,'muted'));root.append(cards);
    const paging=element('div','','knowledge-actions');
    if(page>0)paging.append(button(t.previous,async()=>{page--;}));
    paging.append(element('span',`${visible.length?Math.min(page*pageSize+1,visible.length):0}–${Math.min((page+1)*pageSize,visible.length)} / ${visible.length}`));
    if((page+1)*pageSize<visible.length)paging.append(button(t.next,async()=>{page++;}));root.append(paging);
    const creator=document.createElement('details');creator.append(element('summary',t.new));
    const form=document.createElement('form');form.className='knowledge-form';
    const draft=drafts.get(locale)??{};
    const kindInput=document.createElement('select');for(const value of ['tactic','mechanic','recognition'])kindInput.append(new Option(t[value],value));
    kindInput.value=draft.kind??'tactic';
    const titleInput=document.createElement('input');titleInput.required=true;titleInput.maxLength=100;
    const reasonInput=document.createElement('textarea');reasonInput.required=true;reasonInput.rows=3;reasonInput.maxLength=1500;
    titleInput.value=draft.title??'';reasonInput.value=draft.reason??'';
    titleInput.oninput=reasonInput.oninput=kindInput.onchange=()=>drafts.set(locale,{kind:kindInput.value,title:titleInput.value,reason:reasonInput.value});
    if(draft.title||draft.reason)creator.open=true;
    const save=element('button',t.save,'primary');save.type='submit';
    form.append(field(t.kind,kindInput),field(t.heading,titleInput),field(t.reason,reasonInput),element('p',t.note,'muted'),save);
    form.onsubmit=event=>{event.preventDefault();void perform(async()=>{
      data=await post('/api/admin/knowledge/create',{kind:kindInput.value,language:locale,title:titleInput.value,reason:reasonInput.value});
      page=0;work='open';kind='';stage='';origin='';search='';drafts.delete(locale);
    });};creator.append(form);root.append(creator,element('p',t.reserved,'muted'));
    const message=element('p',error,'knowledge-message');message.setAttribute('role','status');root.append(message);
    for(const node of root.querySelectorAll('button'))node.disabled=busy;
  }
  return {load,render};
}
