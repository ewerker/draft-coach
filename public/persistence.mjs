import {translate} from './language.mjs';
export const persistenceLabels={
  de:{recovery:'Offene Partie gesichert',explain:'Setze nur fort, wenn auf dem Gerät dieselbe Partie läuft. Aufnahme und automatische Klicks starten dabei nicht von selbst.',
    resume:'Dieselbe Partie fortsetzen',unknown:'Mit unbekanntem Ergebnis abschließen',abandon:'Als abgebrochen abschließen',images:'Aufnahmen',
    jobs:'Hintergrundaufträge',refresh:'Stand aktualisieren',pending:'Wartet',running:'Läuft',done:'Fertig',failed:'Fehlgeschlagen',all:'Alle',
    archive:'Belegbilder sichern',prepare_review:'Partiedaten prüfen',pause:'Die Aufträge warten während Aufnahme und Spiel. Sie laufen in der nächsten Spielpause weiter.',
    ready:'Aufträge werden in Spielpausen automatisch bearbeitet.',empty:'Noch keine Hintergrundaufträge. Neue abgeschlossene Partien legen sie automatisch an.',
    retry:'Erneut versuchen',attempt:'Versuche',filter:'Aufträge anzeigen',dataOnly:'Datenprüfung; keine Prüfung der taktischen Wirksamkeit.',
    counts:'Entscheidungen',unknownOffers:'Unklare Angebote',sent:'Gesendete Klicks',transitions:'Bildwechsel danach',failures:'Fehlgeschlagene Klicks',
    actual:'Die tatsächlich am Telefon gewählte Karte ist damit noch nicht bewiesen.',budget:'Neuer Bildspeicher',perMatch:'Je Partie höchstens',
    protected:'Bestätigte Prüfbilder und ältere Archivbelege werden nicht automatisch gelöscht.',cost:'Diese Aufträge laufen lokal und verursachen keine API-Kosten.',
    newest:'Es werden höchstens die letzten 30 passenden Aufträge gezeigt.',restart:'Nach Programmneustart wieder aufgenommen',unknownMode:'Spielmodus offen'},
  en:{recovery:'Unfinished match saved',explain:'Resume only if the same match is still on the device. Capture and automatic taps will not start by themselves.',
    resume:'Resume the same match',unknown:'Close with unknown result',abandon:'Close as abandoned',images:'captures',
    jobs:'Background jobs',refresh:'Refresh status',pending:'Waiting',running:'Running',done:'Done',failed:'Failed',all:'All',
    archive:'Save evidence images',prepare_review:'Check match data',pause:'Jobs wait during capture and play. They resume during the next break.',
    ready:'Jobs are processed automatically during breaks.',empty:'No background jobs yet. Newly completed matches create them automatically.',
    retry:'Retry',attempt:'Attempts',filter:'Show jobs',dataOnly:'Data check; tactical effectiveness has not been tested.',
    counts:'Decisions',unknownOffers:'Unclear offers',sent:'Sent taps',transitions:'Subsequent screen changes',failures:'Failed taps',
    actual:'This does not prove which card was actually chosen on the phone.',budget:'New image storage',perMatch:'Per match, at most',
    protected:'Confirmed review images and earlier archived evidence are not automatically deleted.',cost:'These jobs run locally and incur no API costs.',
    newest:'At most the latest 30 matching jobs are shown.',restart:'Resumed after a program restart',unknownMode:'Game mode unknown'}
};
export function createPersistencePanel({jobsRoot,recoveryRoot,getLanguage,post,onChanged}){
  let data=null,rows=[],key='',lastLoad=0,loading=false,filter='';
  const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
  const button=(text,run)=>{const node=el('button',text,'small');node.type='button';node.onclick=async()=>{
    node.disabled=true;try{await run();}catch(error){const p=el('p',translate(error.message,getLanguage()),'persistence-error');p.setAttribute('role','alert');node.parentElement?.append(p);}finally{node.disabled=false;}
  };return node;};
  function renderRecovery(next=rows){
    rows=next;const locale=getLanguage(),t=persistenceLabels[locale],signature=JSON.stringify([locale,rows]);
    if(signature===key)return;key=signature;recoveryRoot.replaceChildren();recoveryRoot.hidden=!rows.length;
    if(!rows.length)return;
    recoveryRoot.append(el('h3',t.recovery),el('p',t.explain,'muted'));
    for(const row of rows){
      const card=el('article','','recovery-entry');
      card.append(el('p',`#${row.id.slice(0,8)} · ${new Date(row.started).toLocaleString(locale==='en'?'en-GB':'de-DE')} · ${row.mode==='draft'?'Draft':row.mode==='arena'?(locale==='en'?'Battle':'Schlacht'):t.unknownMode} · ${row.captures} ${t.images}`));
      const actions=el('div','','persistence-actions');
      for(const [action,label] of [['resume',t.resume],['unbekannt',t.unknown],['abgebrochen',t.abandon]])actions.append(button(label,async()=>{
        await post('/api/matches/recover',{id:row.id,action});await onChanged();
      }));card.append(actions);recoveryRoot.append(card);
    }
  }
  function renderJobs(){
    if(!data)return;
    const locale=getLanguage(),t=persistenceLabels[locale];jobsRoot.replaceChildren();
    const bar=el('div','','persistence-actions');bar.append(el('h3',t.jobs),button(t.refresh,()=>refreshJobs(true)));jobsRoot.append(bar);
    const jobs=data.jobs;
    const counter=jobsRoot.parentElement.querySelector('.persistence-count');
    if(counter)counter.textContent=` · ${jobs.filter(j=>j.status==='pending').length} ${t.pending.toLowerCase()} · ${jobs.filter(j=>j.status==='failed').length} ${t.failed.toLowerCase()}`;
    jobsRoot.append(el('p',['pending','running','done','failed'].map(status=>`${jobs.filter(j=>j.status===status).length} ${t[status].toLowerCase()}`).join(' · ')));
    jobsRoot.append(el('p',data.paused?t.pause:t.ready,'muted'));
    const select=document.createElement('select');for(const status of ['','pending','running','failed','done'])select.append(new Option(t[status]??t.all,status));select.value=filter;
    select.onchange=()=>{filter=select.value;renderJobs();};const label=el('label',t.filter);label.className='persistence-filter';label.append(select);jobsRoot.append(label);
    if(!jobs.length)jobsRoot.append(el('p',t.empty,'muted'));
    for(const job of jobs.filter(job=>!filter||job.status===filter).slice(0,30)){
      const card=el('article','','background-job');
      card.append(el('strong',`${t[job.kind]} · ${t[job.status]} · #${job.match_id.slice(0,8)}`));
      card.append(el('p',`${new Date(job.updated).toLocaleString(locale==='en'?'en-GB':'de-DE')} · ${t.attempt}: ${job.attempts}/3`,'muted'));
      if(job.error)card.append(el('p',job.error==='PROCESS_RESTARTED'?t.restart:job.error,'persistence-error'));
      if(job.status==='failed')card.append(button(t.retry,async()=>{await post('/api/admin/jobs/retry',{id:job.id});await refreshJobs(true);}));
      const report=job.report;
      if(job.status==='done'&&report?.kind==='data_completeness'){
        card.append(el('p',`${t.counts}: ${report.decisions} · ${t.unknownOffers}: ${report.unknownOffers} · ${t.sent}: ${report.sentActions} · ${t.transitions}: ${report.transitionsObserved} · ${t.failures}: ${report.failedActions}`));
        card.append(el('p',t.dataOnly+' '+t.actual,'muted'));
      }
      jobsRoot.append(card);
    }
    if(jobs.length>30)jobsRoot.append(el('p',t.newest,'muted'));
    const images=data.images,mb=value=>(value/1048576).toLocaleString(locale==='en'?'en-GB':'de-DE',{maximumFractionDigits:1});
    jobsRoot.append(el('p',`${t.budget}: ${mb(images.newBytes)} / ${mb(images.limits.totalNewBytes)} MiB · ${images.images} ${t.images}`));
    jobsRoot.append(el('p',`${t.perMatch} ${images.limits.perMatch} ${t.images}, ${mb(images.limits.perMatchBytes)} MiB. ${t.protected} ${t.cost}`,'muted'));
  }
  async function refreshJobs(force=false){
    if(loading||!force&&Date.now()-lastLoad<5000)return;loading=true;lastLoad=Date.now();
    try{const response=await fetch('/api/admin/jobs');const value=await response.json();if(!response.ok)throw Error(value.error);const changed=JSON.stringify(value)!==JSON.stringify(data);data=value;if(changed||force)renderJobs();}
    catch(error){if(!data)jobsRoot.replaceChildren(el('p',error.message,'persistence-error'));}
    finally{loading=false;}
  }
  return {refreshJobs,renderRecovery,renderJobs};
}
