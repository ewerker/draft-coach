import {displayNames,translate} from './language.mjs';
const $=id=>document.getElementById(id);
const displayCardNames=text=>typeof text==='string'?text.replaceAll('Zerstörer','Verwüster'):text;
const browserId=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
const browserHeaders={'X-Coach-Client':browserId};
const fetchState=()=>fetch('/api/state',{headers:browserHeaders,signal:AbortSignal.timeout(5000)});
let lastId=null,lastAdvice='',current=null,mic=null,armed=false,speaking=false,lastVoiceAt=0,refsShown=false;
let overlayKey='',offersKey='';
let prepKey=null;
let collectionReview=null;
const speech=window.speechSynthesis;
const preferencesKey='draft-coach-preferences';
let preferences={};
try{preferences=JSON.parse(localStorage.getItem(preferencesKey))||{};}catch{}
function rememberPreferences(changes){
  preferences={...preferences,...changes};
  try{localStorage.setItem(preferencesKey,JSON.stringify(preferences));}catch{}
}
const systemTheme=matchMedia('(prefers-color-scheme: dark)');
const themeSelect=$('theme');
themeSelect.value=['light','dark'].includes(preferences.theme)?preferences.theme:'system';
function applyTheme(){
  const choice=themeSelect.value;
  document.documentElement.dataset.theme=choice==='system'?(systemTheme.matches?'dark':'light'):choice;
}
applyTheme();
systemTheme.addEventListener('change',applyTheme);
themeSelect.onchange=()=>{
  rememberPreferences({theme:themeSelect.value});
  applyTheme();
};
const config=await fetch('/api/config').then(r=>r.json());
let language=preferences.language==='en'?'en':'de';
const originalText=new WeakMap(),originalAttributes=new WeakMap();
const translatedAttributes=['title','aria-label','placeholder','alt','label'];
function localizeNode(node){
  if(node.nodeType===Node.TEXT_NODE){
    if(node.parentElement?.closest('.quick-user,script,style,textarea'))return;
    const saved=originalText.get(node);
    const source=saved?.rendered===node.data?saved.source:node.data;
    const rendered=translate(source,language);
    originalText.set(node,{source,rendered});
    if(node.data!==rendered)node.data=rendered;
    return;
  }
  if(node.nodeType!==Node.ELEMENT_NODE)return;
  const saved=originalAttributes.get(node)??{};
  for(const name of translatedAttributes){
    const value=node.getAttribute(name);
    if(value===null)continue;
    const source=saved[name]?.rendered===value?saved[name].source:value;
    const rendered=translate(source,language);
    saved[name]={source,rendered};
    if(value!==rendered)node.setAttribute(name,rendered);
  }
  originalAttributes.set(node,saved);
}
function localizeTree(root){
  localizeNode(root);
  if(root.nodeType!==Node.ELEMENT_NODE)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  while(walker.nextNode())localizeNode(walker.currentNode);
}
function applyLanguage(){
  document.documentElement.lang=language;
  $('language').value=language;
  $('quick-language-note').hidden=language!=='en';
  localizeTree(document.documentElement);
}
applyLanguage();
new MutationObserver(changes=>{
  for(const change of changes){
    if(change.type==='childList')for(const node of change.addedNodes)localizeTree(node);
    else localizeNode(change.target);
  }
}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:translatedAttributes});
$('language').onchange=()=>{
  language=$('language').value==='en'?'en':'de';
  rememberPreferences({language});
  stopMic();
  speech?.cancel();
  applyLanguage();
  void action(()=>post('/api/settings',{gameLanguage:language}));
};
$('read-tip').checked=preferences.readTip===true;
$('show-intermediates').checked=preferences.showIntermediates===true;
let tapAudio=null,lastTapSoundId=0,pendingTapSound=null;
async function armTapAudio(){
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return false;
  try{
    tapAudio??=new Audio();
    if(tapAudio.state!=='running')await tapAudio.resume();
    return tapAudio.state==='running';
  }catch{return false;}
}
function playClickTone(sent){
  if(tapAudio?.state!=='running')return false;
  const tone=tapAudio.createOscillator();
  const volume=tapAudio.createGain();
  const now=tapAudio.currentTime;
  tone.frequency.value=sent?740:330;
  volume.gain.setValueAtTime(.2,now);
  volume.gain.exponentialRampToValueAtTime(.001,now+.2);
  tone.connect(volume).connect(tapAudio.destination);
  tone.onended=()=>{tone.disconnect();volume.disconnect();};
  tone.start(now);
  tone.stop(now+.2);
  return true;
}
function playTapResult(result){
  if(!result||result.id<=lastTapSoundId)return;
  if(pendingTapSound?.id!==result.id)pendingTapSound={id:result.id,firstSeen:Date.now()};
  if(Date.now()-pendingTapSound.firstSeen>3000){
    lastTapSoundId=result.id;
    return;
  }
  if(playClickTone(result.outcome==='gesendet')){
    lastTapSoundId=result.id;
    $('audio-status').textContent='';
    return;
  }
  $('audio-status').textContent='Klickton wartet auf Audiofreigabe. Tippe auf „Ton testen“.';
}
$('test-audio').onclick=async()=>{
  const status=$('audio-status');
  status.textContent='Ton wird vorbereitet …';
  const unlocked=await Promise.race([armTapAudio(),new Promise(resolve=>setTimeout(()=>resolve(false),1500))]);
  status.textContent=unlocked&&playClickTone(true)?'Testton in diesem Browser gestartet.':
    'Der Browser hat Audio nicht freigegeben.';
};
let spokenChoice='',spokenSpellSlots=0,muteThroughId=0,manualCapturePending=false;
function readTip(state){
  const control=$('read-tip');
  control.disabled=!speech;
  $('read-tip-control').title=!speech?'Dieser Browser unterstützt keine Sprachausgabe.':'';
  if($('stop').disabled)muteThroughId=Math.max(muteThroughId,state.latestId);
  if(!state.audioHere||state.mode==='prep'||control.disabled||!control.checked||$('stop').disabled){
    if(speech?.speaking||speech?.pending)speech.cancel();
    return;
  }
  const frame=state.current;
  if(!frame||frame.id<=muteThroughId||frame.mode!==state.mode||frame.source==='reference'||frame.expired||Date.now()-frame.started>6000)return;
  const spell=frame.phase==='spell_choice';
  if(!spell&&spokenSpellSlots){
    spokenSpellSlots=0;
    spokenChoice='';
  }
  if(frame.phase==='battle'){
    spokenChoice='';
    return;
  }
  const {best,fallback,provisional}=frame.advice;
  const tip=best??fallback??provisional;
  if(!tip)return;
  const offer=frame.offers[tip.index];
  const position=pos[tip.position??offer?.position??tip.index];
  // After a multi-card spell offer, the confirmed card can remain visible on its own.
  if(spell&&spokenSpellSlots>1&&frame.offers.length===1)return;
  if(spell)spokenSpellSlots=frame.offers.length;
  const level=spell?offer?.orange?.value:null;
  const choice=JSON.stringify([frame.phase,position,tip.name,offer?.action,offer?.quantity,level]);
  if(choice===spokenChoice)return;
  spokenChoice=choice;
  speech.cancel();
  const label=spell?'Zaubertipp':best?'Tipp':fallback?'Versuchstipp':'Vorläufiger Tipp';
  const detail=displayNames(tip.name,language)||(level!=null?translate(`Stufe ${level}`,language):null);
  const utterance=new SpeechSynthesisUtterance([translate(label,language),translate(position,language),detail].filter(Boolean).join('. '));
  utterance.lang=language==='en'?'en-US':'de-DE';
  speech.speak(utterance);
}
async function post(url,data={},signal) {
  const send = () => fetch(url, {
    method: 'POST',
    headers: {...browserHeaders,'Content-Type':'application/json','X-Coach-Token':config.token},
    body: JSON.stringify(data),signal
  });
  let response = await send();
  let result = await response.json();
  if (response.status === 403 && result.error === 'Anfrage nicht freigegeben') {
    const refreshed = await fetch('/api/config', {cache:'no-store'});
    if (refreshed.ok) {
      const {token} = await refreshed.json();
      config.token = token;
      response = await send();
      result = await response.json();
    }
  }
  if (!response.ok) throw Error(result.error);
  return result;
}
function error(e){$('error').textContent=e.message||String(e);$('error').hidden=false;}
async function action(fn){try{$('error').hidden=true;await fn();await refresh();}catch(e){error(e);}}
$('capture').onclick=async()=>{
  if(manualCapturePending)return;
  armTapAudio();
  manualCapturePending=true;
  $('capture').disabled=true;
  await action(async()=>{
    try{
      if($('auto').dataset.running==='true'){
        await post('/api/settings',{auto:false});
        const deadline=Date.now()+13000;
        while(Date.now()<deadline){
          const state=await fetchState().then(r=>r.json());
          if(!state.capturing&&!state.manualTapPending)break;
          await new Promise(resolve=>setTimeout(resolve,120));
        }
      }
      await post('/api/capture');
    }finally{manualCapturePending=false;}
  });
};
let coachView='game';
let gameMode=$('mode').value;
const viewHints={quick:'Fragen aus dem lokalen Taktiklexikon beantworten.',tactics:'Regeln, Testvorschauen und Notizen bearbeiten.',admin:'Partien archivieren und SQLite-Sicherungen herunterladen.',help:'Anleitung und Antworten auf häufige Fragen.'};
function showCoachView(view){
  coachView=view;
  $('game-view').hidden=view!=='game';
  $('quick-panel').hidden=view!=='quick';
  $('tactics-panel').hidden=view!=='tactics';
  $('admin-panel').hidden=view!=='admin';
  $('help-panel').hidden=view!=='help';
  $('mode').value=view==='game'?gameMode:view;
  if(viewHints[view])$('mode-hint').textContent=viewHints[view];
  if(view==='quick')$('quick-question').focus();
  if(view==='help')$('help-title').focus();
}
$('mode').onchange=()=>{
  speech?.cancel();
  spokenChoice='';
  const mode=$('mode').value;
  if(Object.hasOwn(viewHints,mode)){
    showCoachView(mode);
    if(mode==='admin')void updateArchive();
    if(mode==='tactics')void openTactics();
    return;
  }
  showCoachView('game');
  if(mode===gameMode){void refresh();return;}
  return action(async()=>{
    await post('/api/settings',{mode,autoTap:mode!=='prep'&&preferences.autoTap===true});
    rememberPreferences({mode});
  });
};
$('auto-tap').onchange=()=>{
  const enabled=$('auto-tap').checked;
  armTapAudio();
  return action(async()=>{
    await post('/api/settings',{autoTap:enabled});
    rememberPreferences({autoTap:enabled});
  });
};
$('read-tip').onchange=()=>{
  rememberPreferences({readTip:$('read-tip').checked});
  if($('read-tip').checked)return action(()=>post('/api/browser/audio'));
  speech?.cancel();
};
$('prep-kind').onchange=()=>action(()=>post('/api/settings',{preparationKind:$('prep-kind').value}));
function showSavedCollection(collection) {
  $('collection-footer').textContent='Draft Coach · '+collection.units.units.length+' Einheiten · '+collection.spells.spells.length+' Zauber';
  $('saved-collection').textContent =
    'Aktiver Stand · '+collection.units.units.length+' Einheiten und '+collection.spells.spells.length+' Zauber. '+
    'Einheiten: '+(displayCardNames(collection.units.active_lineup.join(', '))||'keine ausgewählt')+'. '+
    'Zauber: '+(collection.spells.active_loadout.join(', ')||'keine ausgewählt')+'.';
}
showSavedCollection(config.collection);

function renderCollectionReview(draft) {
  const review=$('import-review');
  review.replaceChildren();
  for(const warning of draft.warnings)review.append(textEl('p',warning,'muted'));
  for(const [kind,label] of [['units','Einheiten'],['spells','Zauber']]){
    review.append(textEl('h3',label+' · '+draft.groups[kind].length));
    const table=document.createElement('table');
    table.className='collection-table';
    const heading=table.createTHead().insertRow();
    for(const title of ['Karte','Vorhanden','Stärke','Aufstellung','Auswertung'])heading.append(textEl('th',title));
    const rows=table.createTBody();
    for(const card of draft.groups[kind]){
      const row=rows.insertRow();
      const visibleName=displayCardNames(card.name);
      row.insertCell().textContent=visibleName;
      const owned=document.createElement('input');
      owned.type='checkbox';
      owned.checked=card.owned;
      owned.setAttribute('aria-label',visibleName+' vorhanden');
      row.insertCell().append(owned);
      const level=document.createElement('input');
      level.type='number';
      level.min='1';
      level.max='25';
      level.value=card.level??'';
      level.setAttribute('aria-label','Stärke '+visibleName);
      row.insertCell().append(level);
      const selected=document.createElement('input');
      selected.type='checkbox';
      selected.checked=card.selected;
      selected.setAttribute('aria-label',visibleName+' in Aufstellung');
      row.insertCell().append(selected);
      row.insertCell().textContent=card.conflict?'Abweichende Werte prüfen':card.levelRead?'Aus Aufnahme':card.seen?'Karte erkannt, bisherige Stärke':'Bisheriger Stand';
      owned.onchange=()=>{card.owned=owned.checked;if(!owned.checked){selected.checked=false;card.selected=false;}};
      selected.onchange=()=>{card.selected=selected.checked;if(selected.checked){owned.checked=true;card.owned=true;}};
      level.oninput=()=>{card.level=level.value===''?null:Number(level.value);};
    }
    review.append(table);
  }
  review.hidden=false;
  $('apply-collection').hidden=false;
}
$('import-collection').onclick=async()=>{
  const button=$('import-collection');
  button.disabled=true;
  $('import-status').textContent='Aufnahmen werden ausgewertet …';
  await action(async()=>{
    collectionReview=await post('/api/preparation/import');
    renderCollectionReview(collectionReview);
    $('import-status').textContent='Vorschau. Mit „Geprüfte Sammlung übernehmen“ aktivierst du die angezeigte Aufstellung.';
  });
  if(!$('error').hidden)$('import-status').textContent='';
  button.disabled=false;
};
$('apply-collection').onclick=async()=>{
  if(!collectionReview)return;
  const button=$('apply-collection');
  button.disabled=true;
  await action(async()=>{
    const {collection}=await post('/api/preparation/apply',collectionReview);
    config.collection=collection;
    showSavedCollection(collection);
    collectionReview=null;
    $('import-review').hidden=true;
    button.hidden=true;
    $('import-status').textContent='Sammlung und Aufstellung gespeichert.';
  });
  button.disabled=false;
};
$('connection').onclick=()=>{$('setup').open=true;};
$('auto').onclick=()=>{
  armTapAudio();
  return action(()=>post('/api/settings',{auto:true}));
};
$('setup-wifi-connect').onsubmit=event=>{
  event.preventDefault();
  return action(async()=>{
    const address=$('device').value.trim();
    if(!/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(address))throw Error('Gib IP-Adresse und Port ein, wie sie auf der Hauptseite „Debugging über WLAN“ stehen.');
    await post('/api/settings',{device:address});
    const {message}=await post('/api/connect');
    const result=await fetch('/api/devices').then(response=>response.json());
    const connected=result.devices?.some(entry=>entry.serial===address&&entry.status==='device');
    $('setup-message').textContent=connected?'WLAN verbunden. '+message:
      'Verbindung nicht hergestellt. '+message+' Prüfe die IP-Adresse und den Port auf der Hauptseite des Zielgeräts.';
  });
};
const setupPaths=['usb','pair','legacy'];
let setupPath=null;
function showSetupPath(name){
  setupPath=name;
  for(const path of setupPaths){
    $('tab-'+path).setAttribute('aria-pressed',String(path===name));
    $('setup-'+path).hidden=path!==name;
  }
  $('setup-wifi-connect').hidden=name==='usb';
}
for(const name of setupPaths){
  const button=$('tab-'+name);
  button.setAttribute('aria-controls','setup-'+name);
  button.setAttribute('aria-pressed',String(name==='usb'));
  button.onclick=()=>showSetupPath(name);
}
$('scan-devices').onclick=()=>action(async()=>{const r=await fetch('/api/devices').then(r=>r.json());if(r.error)throw Error(r.error);$('devices').replaceChildren();if(!r.devices.length)$('devices').textContent='Kein Gerät gefunden. Kabel, USB-Debugging und Freigabe am Handy prüfen.';for(const d of r.devices){const row=textEl('p',`${d.model||d.serial} · ${d.transport==='usb'?'USB':'WLAN'} · ${d.status} `);const b=textEl('button','Auswählen');b.disabled=d.status!=='device';b.onclick=()=>action(async()=>{await post('/api/settings',{device:d.serial});$('device').value=d.serial;$('setup-message').textContent='Gerät ausgewählt. Die Probeaufnahme startet automatisch.';});row.append(b);$('devices').append(row);}});
$('pair').onclick=()=>action(async()=>{const code=$('pair-code').value.trim();$('pair-code').value='';const r=await post('/api/pair',{address:$('pair-address').value.trim(),code});$('setup-message').textContent=r.message;});
$('enable-wifi').onclick=()=>action(async()=>{const r=await post('/api/enable-wifi',{confirm:true});$('device').value=r.address;$('setup-message').textContent=r.message+' · Die Probeaufnahme startet automatisch.';});
$('usb-only').onclick=()=>action(async()=>{const r=await post('/api/usb-only');$('setup-message').textContent=r.message;});
$('probe').onclick=()=>action(()=>post('/api/probe'));
function stopMic(){armed=false;mic?.abort();mic=null;$('mic').textContent='Mikrofon einschalten';$('mic').classList.remove('listening');}
const matchDialog=$('match-outcome');
const matchForm=matchDialog.querySelector('form');
const matchError=$('match-outcome-error');
let savingOutcome=false;
$('stop').onclick=async()=>{
  stopMic();
  speech?.cancel();
  $('stop').disabled=true;
  try {
    await action(async()=>{
      const {matchId}=await post('/api/partie/stopp');
      if(!matchId||matchDialog.open)return;
      matchDialog.dataset.matchId=matchId;
      matchError.hidden=true;
      matchDialog.showModal();
    });
  } finally {$('stop').disabled=false;spokenChoice='';}
};
matchDialog.addEventListener('cancel',event=>{if(savingOutcome)event.preventDefault();});
matchForm.onsubmit=async event=>{
  const outcome=event.submitter?.value;
  if(!savingOutcome&&outcome==='skip')return;
  event.preventDefault();
  if(savingOutcome||!outcome)return;
  savingOutcome=true;
  const buttons=matchForm.querySelectorAll('button');
  buttons.forEach(button=>button.disabled=true);
  matchError.hidden=true;
  try {
    await post('/api/partie/ergebnis',{matchId:matchDialog.dataset.matchId,outcome});
    matchDialog.close();
  } catch(e){
    matchError.textContent=e.message;
    matchError.hidden=false;
  } finally {
    savingOutcome=false;
    buttons.forEach(button=>button.disabled=false);
    if(matchDialog.open)event.submitter.focus();
  }
};
function listen(){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){error(Error('Dieser Browser bietet keine Spracherkennung. Bitte Chrome/Edge oder den Aufnahmebutton verwenden.'));stopMic();return;}
  if(!armed)return;
  const rec=new Recognition();mic=rec;rec.lang=language==='en'?'en-US':'de-DE';rec.continuous=true;rec.interimResults=false;
  rec.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++){if(!e.results[i].isFinal)continue;const text=e.results[i][0].transcript.toLowerCase().trim();$('voice').textContent='Gehört: '+text;if(/\b(stopp?|ende|end)\b/.test(text)){$('stop').click();return;}if(/\b(jetzt|klick|click|start|now)\b/.test(text)&&Date.now()-lastVoiceAt>1200){lastVoiceAt=Date.now();$('capture').click();}}};
  rec.onerror=e=>{if(['not-allowed','service-not-allowed','audio-capture','network'].includes(e.error)){stopMic();error(Error('Spracherkennung nicht verfügbar ('+e.error+'). Aufnahmebutton bleibt nutzbar.'));}};
  rec.onend=()=>{if(mic===rec)mic=null;if(armed)setTimeout(listen,350);};
  try{rec.start();}catch{stopMic();error(Error('Mikrofon konnte nicht gestartet werden.'));}
}
$('mic').onclick=()=>{if(armed){stopMic();return;}armed=true;$('mic').textContent='Mikrofon aus';$('mic').classList.add('listening');listen();};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&coachView==='game'&&!matchDialog.open&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();$('capture').click();}});
const phaseNames={unknown:'Bildschirm unklar',deck_choice:'Deckwahl',battle:'Spielfeld',battle_choice:'Wahl im Kampf',spell_choice:'Zauberauswahl',collection:'Einheitensammlung',spells:'Zaubersammlung'};
const pos=['Links','Mitte','Rechts','Vierte Karte'];
function textEl(tag,text,cls){const e=document.createElement(tag);e.textContent=displayCardNames(text);if(cls)e.className=cls;return e;}
if(config.localAdmin)$('organization-options').append(new Option('Admin · Archiv','admin'));
let archiveBusy=false;
function renderArchive(data){
  const size=new Intl.NumberFormat('de',{maximumFractionDigits:1}).format(data.bytes/1024/1024);
  $('archive-summary').textContent=`${data.games} Partien im Archiv · ${data.pending} zur Übernahme · ${data.evidence} Belegbilder · ${data.insights} archivierte Erkenntnisse · ${size} MiB`;
  $('archive-import').disabled=!data.pending;
  const recent=$('archive-games');
  recent.replaceChildren(...data.recent.map(game=>{
    const date=new Date(game.ende_ms).toLocaleString(language==='en'?'en-GB':'de-DE');
    const mode=game.modus==='arena'?'Schlacht':game.modus==='draft'?'Draft':game.modus;
    return textEl('li',`${date} · ${mode} · ${game.ergebnis} · ${game.aufnahmezahl} Aufnahmen · ${game.bilder} Belegbilder`);
  }));
}
async function updateArchive(importGames=false){
  if(archiveBusy)return;
  archiveBusy=true;
  $('archive-import').disabled=true;
  $('archive-refresh').disabled=true;
  const message=$('archive-message');
  message.textContent=importGames?'Partien werden übernommen …':'Archiv wird gelesen …';
  try{
    if(importGames){
      const result=await post('/api/admin/archiv/uebernehmen');
      renderArchive(result.status);
      message.textContent=`${result.imported} Partien übernommen · ${result.images} Bilder gesichert.`;
    }else{
      const response=await fetch('/api/admin/archiv');
      const data=await response.json();
      if(!response.ok)throw Error(data.error);
      renderArchive(data);
      message.textContent='';
    }
  }catch(error){message.textContent=error.message;}
  finally{archiveBusy=false;$('archive-refresh').disabled=false;}
}
function returnToGame(){showCoachView('game');$('mode').focus();void refresh();}
$('close-admin').onclick=returnToGame;
$('close-help').onclick=returnToGame;
$('archive-refresh').onclick=()=>updateArchive();
$('archive-import').onclick=()=>updateArchive(true);
let quickSubjects=[];
const quickForm=$('quick-form');
const quickRecentKey='draft-coach-recent-questions';
const quickRecentLimit=10;
let recentQuestions=[];
try{
  const saved=JSON.parse(localStorage.getItem(quickRecentKey));
  if(Array.isArray(saved))recentQuestions=saved.filter(item=>
    typeof item?.question==='string'&&item.question.trim()&&item.question.length<=500&&
    Array.isArray(item.subjects)&&item.subjects.every(name=>typeof name==='string')
  ).slice(0,quickRecentLimit);
}catch{}
function renderRecentQuestions(){
  $('quick-recent').hidden=!recentQuestions.length;
  $('quick-recent-count').textContent=String(recentQuestions.length);
  $('quick-recent-list').replaceChildren(...recentQuestions.map(({question,subjects})=>{
    const needsContext=/\b(dagegen|damit|ihn|ihr|sie|ihm|it|them|that)\b/i.test(question)||/^(und|dann|and|then)\b/i.test(question);
    const label=needsContext&&subjects.length?question+' · '+subjects.join(', '):question;
    const button=textEl('button',label,'small');
    button.type='button';
    button.onclick=()=>void askQuick(question,subjects);
    return button;
  }));
}
function rememberQuestion(question,subjects){
  const key=item=>JSON.stringify([item.question.trim().toLocaleLowerCase('de').replace(/\s+/g,' ').replace(/[?!\.]+$/,''),item.subjects]);
  const entry={question,subjects:subjects.slice(0,3)};
  recentQuestions=[entry,...recentQuestions.filter(item=>key(item)!==key(entry))].slice(0,quickRecentLimit);
  try{localStorage.setItem(quickRecentKey,JSON.stringify(recentQuestions));}catch{}
  renderRecentQuestions();
}
async function askQuick(question,context=quickSubjects){
  const input=$('quick-question');
  const submit=quickForm.querySelector('button[type="submit"]');
  if(!question||submit.disabled)return;
  submit.disabled=true;
  const history=$('quick-history');
  history.append(textEl('p',question,'quick-message quick-user'));
  const reply=textEl('article','','quick-message');
  history.append(reply);
  const search=new URL('https://www.google.com/search');
  search.searchParams.set('q',['Draft Showdown',...context,question].join(' '));
  $('quick-web').href=search.href;
  $('quick-web').hidden=false;
  try{
    const result=await post('/api/schnellauskunft',{question,context,language});
    if(result.subjects.length)quickSubjects=result.subjects;
    if(result.entries.length)rememberQuestion(question,result.subjects);
    reply.append(textEl('p',result.summary));
    for(const entry of result.entries){
      const block=textEl('div','','quick-entry');
      const status={aktiv:'Aktive Regel',test:'Testregel',notiz:'Notiz',lexikon:'Lexikon'};
      block.append(textEl('strong',entry.title),textEl('small',status[entry.status]??'Lexikon','muted'),textEl('p',entry.detail));
      for(const [index,source] of (entry.sources??[]).entries()){
        const link=textEl('a','Quelle '+(index+1));
        link.href=source;
        link.target='_blank';
        link.rel='noopener noreferrer';
        block.append(link);
      }
      reply.append(block);
    }
    if(input.value.trim()===question)input.value='';
  }catch(error){
    reply.append(textEl('p',error.message));
  }finally{
    submit.disabled=false;
    history.scrollTop=history.scrollHeight;
  }
}
quickForm.onsubmit=event=>{
  event.preventDefault();
  void askQuick($('quick-question').value.trim());
};
renderRecentQuestions();
for(const button of document.querySelectorAll('#quick-panel > .quick-examples button')){
  button.onclick=()=>{
    if(quickForm.querySelector('button[type="submit"]').disabled)return;
    $('quick-question').value=button.textContent;
    quickForm.requestSubmit();
  };
}
const tacticsForm=$('tactics-form');
const tacticStatuses={notiz:'Notiz',test:'Testvorschau',aktiv:'Aktiv'};
let editingTactic=null;
let listedTactics=[];
let changingTactic=false;
function editTactic(rule){
  editingTactic=rule?.id??null;
  $('tactics-form-title').textContent=rule?'Erkenntnis bearbeiten':'Neue Erkenntnis';
  tacticsForm.reset();
  if(rule)for(const name of ['title','reason','mode','phase','offer','enemy','weight','status'])
    tacticsForm.elements.namedItem(name).value=rule[name];
  $('tactics-message').textContent=rule?.evidence?.length?'Belegbilder im Archiv · '+rule.evidence.join(', '):'';
  $('delete-tactic').hidden=!rule;
  for(const row of $('tactics-list').querySelectorAll('button'))
    row.setAttribute('aria-pressed',String(row.dataset.ruleId===editingTactic));
}
function renderTactics({rules,cards,baseCount}){
  listedTactics=rules;
  $('tactics-total').textContent=rules.length+' Einträge';
  $('tactics-sources').textContent=Number.isInteger(baseCount)
    ?'Zusätzlich nutzt die Schnellauskunft '+baseCount+' Einträge aus dem Basislexikon und hinterlegte Kombinationshinweise. Hier bearbeitest du die Taktikregeln.'
    :'';
  for(const [name,empty] of [['offer','Keine Karte · Notiz'],['enemy','Jeder Gegner']]){
    const field=tacticsForm.elements.namedItem(name);
    field.replaceChildren(new Option(empty,''),...cards.map(card=>new Option(displayCardNames(card),card)));
  }
  renderTacticList();
}
function renderTacticList(){
  const normalize=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('de');
  const words=normalize($('tactics-search').value.trim()).split(/\s+/).filter(Boolean);
  const status=$('tactics-filter').value;
  const matches=listedTactics.filter(rule=>{
    if(status&&rule.status!==status)return false;
    const text=[rule.title,rule.offer,rule.enemy,rule.reason].filter(Boolean).join(' ');
    const haystack=normalize(text+' '+displayCardNames(text)+' '+displayNames(text,'en'));
    return words.every(word=>haystack.includes(word));
  }).sort((a,b)=>a.title.localeCompare(b.title,'de'));
  $('tactics-found').textContent=matches.length+' von '+listedTactics.length+' Einträgen';
  const list=$('tactics-list');
  list.replaceChildren();
  for(const rule of matches){
    const weight=rule.weight>0?'+'+rule.weight:String(rule.weight);
    const button=textEl('button','','tactics-row');
    button.type='button';
    button.dataset.ruleId=rule.id;
    button.setAttribute('aria-pressed',String(rule.id===editingTactic));
    button.append(textEl('strong',rule.title),textEl('small',tacticStatuses[rule.status]+' · '+weight+' Punkte','muted'));
    button.onclick=()=>{if(!changingTactic)editTactic(rule);};
    list.append(button);
  }
  if(!matches.length)list.append(textEl('p','Keine passenden Regeln.','muted'));
}
$('tactics-search').oninput=renderTacticList;
$('tactics-filter').onchange=renderTacticList;
async function openTactics(){
  try{
    const response=await fetch('/api/taktikregeln');
    if(!response.ok)throw Error('Taktikregeln konnten nicht geladen werden.');
    renderTactics(await response.json());
    editTactic();
  }catch(error){$('tactics-message').textContent=error.message;}
}
$('close-tactics').onclick=returnToGame;
$('new-tactic').onclick=()=>{if(!changingTactic){editTactic();tacticsForm.elements.namedItem('title').focus();}};
$('delete-tactic').onclick=async()=>{
  const rule=listedTactics.find(entry=>entry.id===editingTactic);
  if(changingTactic||!rule||!window.confirm('„'+displayCardNames(rule.title)+'“ dauerhaft löschen?'))return;
  changingTactic=true;
  $('delete-tactic').disabled=true;
  try{
    renderTactics(await post('/api/taktikregeln/loeschen',{id:rule.id}));
    editTactic();
    $('tactics-message').textContent='Regel gelöscht.';
    await refresh();
  }catch(error){$('tactics-message').textContent=error.message;}
  finally{changingTactic=false;$('delete-tactic').disabled=false;}
};
tacticsForm.onsubmit=async event=>{
  event.preventDefault();
  const submit=tacticsForm.querySelector('button[type="submit"]');
  if(changingTactic)return;
  changingTactic=true;
  submit.disabled=true;
  const data=Object.fromEntries(new FormData(tacticsForm));
  const id=editingTactic;
  try {
    const result=await post('/api/taktikregeln',{...data,id,weight:Number(data.weight)});
    renderTactics(result);
    editTactic(result.rules.find(rule=>rule.id===id)??result.rules.at(-1));
    $('tactics-message').textContent='Gespeichert.';
    await refresh();
  } catch(error){$('tactics-message').textContent=error.message;}
  finally{changingTactic=false;submit.disabled=false;}
};
function renderTacticFeedback(result){
  const feedback=$('tactic-feedback');
  const {trial,evaluated=[]}=result?.advice||{};
  const applied=evaluated.filter(card=>card.rules?.length);
  const tested=trial?.evaluated.filter(card=>card.rules?.some(rule=>rule.status==='test'))||[];
  const summary=[];
  if(applied.length)summary.push('Aktive Regeln · '+applied.map(card=>`${card.name} ${card.delta>0?'+':''}${card.delta}`).join(', '));
  if(tested.length&&trial.pick)summary.push(`Testvorschau · ${pos[trial.pick.index]} · ${trial.pick.name}`);
  feedback.hidden=!summary.length;
  feedback.textContent=displayCardNames(summary.join(' | '));
  feedback.title=displayCardNames([...new Set([...applied,...tested].flatMap(card=>card.rules.map(rule=>rule.title+' · '+rule.reason)))].join('\n'));
}
const hiddenReferenceKey='draft-coach.hidden-references';
let hiddenReferences=new Set();
try{
  const saved=JSON.parse(localStorage.getItem(hiddenReferenceKey)||'[]');
  if(Array.isArray(saved))hiddenReferences=new Set(saved);
}catch{}
function renderReferences(references){
  const gallery=$('references');
  gallery.replaceChildren();
  for(const ref of references){
    if(hiddenReferences.has(ref.file))continue;
    const card=textEl('div','','reference prep-card');
    const run=textEl('button','','reference-run');
    run.type='button';
    const preview=new Image();
    preview.src='/reference/'+ref.file;
    preview.alt=ref.title;
    preview.loading='lazy';
    run.append(preview,textEl('span',ref.title));
    run.onclick=()=>action(()=>post('/api/reference',{file:ref.file}));
    const remove=textEl('button','Aus Galerie entfernen','small');
    remove.type='button';
    remove.setAttribute('aria-label',ref.title+' aus Galerie entfernen');
    remove.onclick=()=>action(()=>{
      const next=new Set([...hiddenReferences,ref.file]);
      localStorage.setItem(hiddenReferenceKey,JSON.stringify([...next]));
      hiddenReferences=next;
      renderReferences(references);
    });
    card.append(run,remove);
    gallery.append(card);
  }
  if(!gallery.childElementCount)gallery.append(textEl('p','Keine Referenzbilder in der Galerie.','muted'));
}
let choosingOffer=false,canTapImage=false;
const screenshot=$('screenshot');
screenshot.onclick=async event=>{
  const frame=current;
  const status=$('image-tap-status');
  if(!frame?.frame)return;
  if(choosingOffer)return;
  if(!canTapImage){
    status.textContent='Bildklick derzeit nicht verfügbar. Prüfe die Tablet-Verbindung.';
    return;
  }
  if(!screenshot.complete||!screenshot.naturalWidth||screenshot.currentSrc!==new URL(frame.image,location.href).href){
    status.textContent='Das Bild wird geladen. Tippe danach erneut.';
    return;
  }
  const {left,top,width,height}=screenshot.getBoundingClientRect();
  void armTapAudio();
  choosingOffer=true;
  status.textContent='Bildklick wird ans Gerät gesendet …';
  try {
    await post('/api/tap-image',{id:frame.id,u:(event.clientX-left)/width,v:(event.clientY-top)/height},AbortSignal.timeout(9000));
    status.textContent='Bildklick gesendet.';
    playClickTone(true);
  }catch(error){
    status.textContent=error.name==='TimeoutError'?'Keine Rückmeldung zum Bildklick. Prüfe den Bildschirm am Gerät.':error.message;
  }finally{choosingOffer=false;}
};
async function chooseOffer(result,card){
  if(!result||choosingOffer)return;
  void armTapAudio();
  choosingOffer=true;
  try{
    const index=result.offers.findIndex(offer=>offer.position===card.position);
    if(index!==-1)await action(async()=>{
      await post('/api/tap-test',{id:result.id,index});
      playClickTone(true);
    });
  }finally{choosingOffer=false;}
}
function canChoose(result,card){
  return result.source!=='reference'&&!result.reviewed&&card.box?.length===4&&
    ['deck_choice','battle_choice','spell_choice'].includes(result.phase);
}
function offerKey(result,card){
  return [card.position,card.name,card.action,card.quantity,!!canChoose(result,card),
    card.action==='spell'?card.orange?.value:null];
}
function draw(result,sentTap){
  const groups=['offers','enemy','own'];
  const best=result.advice?.best;
  const tentative=result.advice?.fallback??result.advice?.provisional;
  const tip=best??tentative;
  const sentIndex=sentTap?.id===result.id?sentTap.index:null;
  const key=JSON.stringify([result.geometry,tip?.index,!!best,sentIndex,groups.map(group=>(result[group]||[]).map(card=>[card.box,!!card.name]))]);
  if(key===overlayKey)return;
  overlayKey=key;
  const svg=$('overlay');
  svg.replaceChildren();
  const geometry=result.geometry;
  const frame=document.createElementNS('http://www.w3.org/2000/svg','g');
  if(geometry){
    const [left,top,width,height]=geometry.content;
    svg.setAttribute('viewBox',`0 0 ${geometry.width} ${geometry.height}`);
    frame.setAttribute('transform',`translate(${left} ${top}) scale(${width/geometry.referenceWidth} ${height/geometry.referenceHeight})`);
  }else{
    svg.setAttribute('viewBox','0 0 1080 2340');
  }
  svg.append(frame);
  for(const group of groups){
    for(const [index,card] of (result[group]||[]).entries()){
      if(!card.box)continue;
      const [x,y,right,bottom]=card.box;
      const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
      const sent=group==='offers'&&index===sentIndex;
      const highlighted=group==='offers'&&index===tip?.index;
      const stroke=highlighted?(best?'#60f394':'#ffdc58'):(card.name?'#bcf388':'#b7c1cf');
      for(const [key,value] of Object.entries({x,y,width:right-x,height:bottom-y,fill:'none',stroke,'stroke-width':highlighted?12:5,rx:8}))
        rect.setAttribute(key,value);
      if(highlighted){
        const outline=rect.cloneNode(false);
        outline.setAttribute('stroke','#15151c');
        outline.setAttribute('stroke-width',22);
        frame.append(outline);
        rect.setAttribute('stroke-width',14);
        rect.setAttribute('stroke-dasharray','34 18');
      }
      frame.append(rect);
      if(sent){
        const badge=document.createElementNS('http://www.w3.org/2000/svg','circle');
        const cx=x+29,cy=y+29;
        for(const [key,value] of Object.entries({cx,cy,r:22,fill:'#15151c',stroke:'#fff','stroke-width':3}))
          badge.setAttribute(key,value);
        const check=document.createElementNS('http://www.w3.org/2000/svg','path');
        for(const [key,value] of Object.entries({d:`M ${cx-10} ${cy} l 7 7 l 13 -14`,fill:'none',stroke:'#fff','stroke-width':5,'stroke-linecap':'round','stroke-linejoin':'round'}))
          check.setAttribute(key,value);
        frame.append(badge,check);
      }
    }
  }
}
function renderOffers(result){
  const key=JSON.stringify([result.phase,result.offers.map(card=>offerKey(result,card))]);
  if(key!==offersKey){
    offersKey=key;
    renderOfferRows(result);
  }
  $('board').replaceChildren();for(const [key,label]of [['enemy','Gegnerische Karten'],['own','Eigene Karten']])$('board').append(textEl('p',label+': '+((result[key]||[]).map(c=>`${c.name} (${c.orange?.value??'Stärke offen'})`).join(', ')||'nicht sicher erfasst')));
  $('notes').replaceChildren();for(const note of result.notes||[])$('notes').append(textEl('p',note));
}
function offerAction(phase,card){
  const multiple=`×${card.quantity??2}`;
  switch(card.action){
    case 'add': return phase==='deck_choice'?'Ins Deck aufnehmen':card.quantity==null?'Hinzufügen · Anzahl offen':`+${card.quantity} hinzufügen`;
    case 'multiply': return `${multiple} · Verdoppeln`;
    case 'upgrade': return 'Aufwerten';
    case 'multiply_upgrade': return `${multiple} · Verdoppeln und aufwerten`;
    case 'spell': return card.orange?.value?`Zauber einsetzen · Stufe ${card.orange.value}`:'Zauber einsetzen';
    default: return 'Aktion nicht erkannt';
  }
}
function renderOfferRows(result){
  $('offers').replaceChildren();
  if(!result.offers.length)$('offers').append(textEl('p',result.phase==='spell_choice'?
    'Die angebotenen Zauber stehen im Handybild.':'Keine Wahlangebote sicher lokalisiert.'));
  for(const c of result.offers){
    const row=textEl('div','','offer');row.dataset.position=c.position;
    const details=textEl('div','','offer-details');
    details.append(textEl('strong',c.name||(result.phase==='spell_choice'?'Zauber':'Figur nicht erkannt')),textEl('span',offerAction(result.phase,c),'offer-action'));
    row.append(textEl('span',pos[c.position],'offer-position'),details);
    if(canChoose(result,c)){
      const tap=textEl('button','Wählen','small');
      tap.type='button';
      tap.setAttribute('aria-label',displayCardNames([pos[c.position],c.name,'wählen'].filter(Boolean).join(' ')));
      tap.onclick=async()=>{
        tap.disabled=true;
        try{await chooseOffer(current,c);}finally{tap.disabled=false;}
      };
      row.append(tap);
    }
    $('offers').append(row);
  }
}
let refreshRequest=0,renderedRequest=0;
async function refresh(){
  const request=++refreshRequest;
  const r=await fetchState();if(!r.ok)throw Error('Server nicht erreichbar');const state=await r.json();
  if(request<renderedRequest)return;
  renderedRequest=request;
  const prep=state.mode==='prep', conn=state.connection||{status:'checking'};
  if(!setupPath&&conn.transport)showSetupPath(conn.transport==='wifi'?'pair':'usb');
  const intermediates=$('show-intermediates');
  const filterImages=!prep&&!intermediates.checked&&(state.auto||state.current?.automatic);
  const displayed=filterImages?state.latestRelevant:state.current;
  $('auto-tap-control').hidden=prep;
  $('read-tip-control').hidden=prep;
  readTip(state);
  $('auto-tap').checked=!!state.autoTap;
  $('auto-tap-status').textContent=displayCardNames(state.tapMessage||'');
  const heartScore=$('heart-score');
  const hearts=state.hearts;
  heartScore.hidden=prep||!hearts;
  if(hearts){
    const {own,enemy}=hearts;
    const position=own===enemy?'Gleichstand':own>enemy?'Vorsprung':'Rückstand';
    heartScore.textContent=`Herzen · Du ${own} · Gegner ${enemy} · ${position}`;
  }
  if(state.audioHere)playTapResult(state.autoTapResult);
  const events=state.enemyEvents||[];
  const eventLabels=events.map(({name,action,quantity})=>action==='add'?`+${quantity} ${name}`:
    action==='multiply'?`${name} ×${quantity}`:`${name} UP!`);
  $('enemy-events').hidden=!events.length;
  $('enemy-events').textContent=events.length?'Gegnerzüge · zuletzt je Figur · '+displayCardNames(eventLabels.join(' · ')):'';
  const connectionLabels={device:'Verbunden',missing:'Nicht verbunden',unauthorized:'Am Handy freigeben',offline:'Gerät offline',checking:'ADB wird geprüft',error:'ADB nicht erreichbar'};
  const selectedName=conn.model==='SM_A556B'?'Samsung Galaxy A55':(conn.model||conn.serial||state.device);
  const connectionText=(connectionLabels[conn.status]||'ADB: '+conn.status)+' · '+selectedName+(conn.transport?' · '+(conn.transport==='wifi'?'WLAN':'USB'):'');
  if($('connection').textContent!==connectionText)$('connection').textContent=connectionText;
  const setupConnection=$('setup-connection');
  if(setupConnection.textContent!==connectionText)setupConnection.textContent=connectionText;
  setupConnection.dataset.status=conn.status;
  const probe=state.deviceProbe;
  let probeText='Warte auf ein verbundenes Gerät.';
  if(probe?.status==='running')probeText='Probeaufnahme läuft. Der Coach vermisst den Bildschirm.';
  else if(probe?.status==='error')probeText='Probeaufnahme fehlgeschlagen. '+probe.error;
  else if(probe?.status==='done'){
    probeText=`Probeaufnahme · ${probe.width} × ${probe.height} Pixel · ${(probe.captureMs/1000).toFixed(2)} s`;
    if(probe.geometry?.layout==='full')probeText+=' · Spielbereich nutzt das ganze Bild';
    else if(probe.geometry){
      const [x,y,width,height]=probe.geometry.content;
      probeText+=` · Spielbereich ${width} × ${height} ab (${x}, ${y})`;
    }else probeText+=' · Spielbereich noch nicht zugeordnet. Öffne das Spiel im Hochformat und wiederhole die Probe.';
  }else if(conn.status==='device')probeText='Probeaufnahme wartet auf den Coach.';
  const probeStatus=$('device-probe');
  if(probeStatus.textContent!==probeText)probeStatus.textContent=probeText;
  $('tab-usb').classList.toggle('connected',conn.status==='device'&&conn.transport==='usb');
  $('connection').dataset.status=conn.status;
  $('connection').title=(conn.serial||state.device)+(conn.otherDevices?' · Weitere erreichbare Verbindungen: '+conn.otherDevices:'');
  $('ready').textContent=state.ready?'Erkennung lokal bereit':'Erkennung nicht bereit';
  $('capture').disabled=manualCapturePending||(!prep&&!state.ready)||(!state.auto&&state.capturing)||conn.status!=='device';
  $('capture-label').textContent=prep?'Jetzt aufnehmen':'Manuell aufnehmen';
  $('probe').disabled=!state.ready||state.auto||state.capturing||state.recognizing||state.manualTapPending||conn.status!=='device';
  $('auto').disabled=state.auto||manualCapturePending||state.capturing||!state.ready||conn.status!=='device';
  $('auto').textContent=state.auto?'Automodus läuft':'Automodus starten';
  $('auto').dataset.running=String(state.auto);
  gameMode=state.mode;
  $('mode').value=coachView==='game'?gameMode:coachView;
  $('mode').disabled=state.capturing&&coachView==='game';
  $('prep-kind').value=state.preparationKind||'units';$('prep-kind').disabled=state.capturing;
  $('preparation').hidden=!prep;
  document.querySelector('.workspace').hidden=prep&&state.current?.source!=='reference';
  $('screen-heading').textContent=prep?'Getestetes Referenzbild':filterImages?'Letzte relevante Aufnahme':'Letzte Aufnahme';
  $('intermediate-control').hidden=prep;
  $('reference-panel').hidden=!prep;
  $('auto').hidden=prep;
  const draftLineup=state.activeLineup??config.collection.units.active_lineup;
  const draftExtra=state.observedDraftUnits??[];
  $('mode-hint').textContent=viewHints[coachView]??(prep?'Einheiten und Zauber getrennt aufnehmen.':state.mode==='draft'?
    (draftLineup.length?'Aktives Draft-Deck · '+displayCardNames(draftLineup.join(', ')):'Noch kein Draft-Deck übernommen.')+
    (draftExtra.length?' · Neu im Spiel erkannt: '+displayCardNames(draftExtra.join(', ')):''):
    'Zauber immer nur aus deiner Auswahl.');
  const shots=state.preparation||[], nextPrepKey=shots.map(p=>p.file).join(',');
  if(prep&&nextPrepKey!==prepKey){
    prepKey=nextPrepKey;
    $('prep-images').replaceChildren();
    $('deck-images').replaceChildren();
    for(const [kind,title,target] of [
      ['units','Einheiten','prep-images'],
      ['spells','Zauber','prep-images'],
      ['deck-units','Ausgewählte Einheiten','deck-images'],
      ['deck-spells','Ausgewählte Zauber','deck-images']
    ]){
      const group=shots.filter(shot=>shot.kind===kind);
      $(target).append(textEl('h3',title+' · '+group.length));
      const list=textEl('div','','references');
      for(const [index,shot] of group.entries()){
        const label=title+' · Aufnahme '+(index+1);
        const card=textEl('div','','reference prep-card');
        const link=textEl('a','');
        link.href=shot.image;
        link.target='_blank';
        link.rel='noopener';
        const preview=new Image();
        preview.src=shot.image;
        preview.loading='lazy';
        preview.alt=label;
        if(kind.startsWith('deck-')){
          const crop=textEl('div','','deck-preview');
          crop.append(preview);
          link.append(crop);
        }else{
          link.append(preview);
        }
        link.append(textEl('span','Aufnahme '+(index+1)));
        const remove=textEl('button','Löschen','small');
        remove.type='button';
        remove.setAttribute('aria-label',label+' löschen');
        remove.onclick=async()=>{
          remove.disabled=true;
          await action(()=>post('/api/preparation/remove',{file:shot.file}));
          remove.disabled=false;
        };
        card.append(link,remove);
        list.append(card);
      }
      if(!group.length)list.append(textEl('span','Noch keine Aufnahme.','muted'));
      $(target).append(list);
    }
  }
  $('prep-count').textContent=shots.length+' Bilder';
  $('activity').textContent=[state.manualTapPending?'Wahl wird geprüft':'',state.capturing?'Aufnahme läuft':'',state.recognizing?'Erkennung läuft':'',state.auto?'Automatik an':''].filter(Boolean).join(' · ')||'Bereit';
  if(state.error)error(Error(state.error));
  if(prep&&!refsShown){renderReferences(state.references);refsShown=true;}
  const c=displayed;
  if(!c){
    current=null;
    lastId=null;
    lastAdvice='';
    $('image-empty').hidden=false;
    $('image-empty').textContent=filterImages?'Noch kein Wahlfenster erkannt.':'Nimm ein Bild auf oder wähle eine Referenz.';
    document.querySelector('.image-wrap').hidden=true;
    $('phase').textContent='Noch kein Bild';
    $('image-caption').textContent='';
    $('advice').textContent='Warte auf Auswahl';
    $('advice').title='';
    $('advice').classList.add('wait');
    renderOffers({offers:[]});
  }
  if(c){current=c;const pending=state.latestId>c.id;const a=JSON.stringify([c.phase,c.advice,c.expired,pending,filterImages]);if(c.id!==lastId){lastId=c.id;$('image-empty').hidden=true;document.querySelector('.image-wrap').hidden=false;$('screenshot').src=c.image;$('phase').textContent=phaseNames[c.phase]||c.phase;$('image-caption').textContent=c.source==='reference'?c.title+' · Gespeichertes Testbild':c.title;$('capture-time').textContent=(c.captureMs/1000).toFixed(2)+' s';$('vision-time').textContent=Math.round(c.visionMs)+' ms';$('total-time').textContent=(c.ageMs/1000).toFixed(2)+' s';renderOffers(c);}draw(c,state.lastCardTap);
    if(a!==lastAdvice){
      lastAdvice=a;
      const {best,provisional,fallback}=c.advice;
      const reasons=[...new Set(c.advice.evaluated?.filter(entry=>entry.score===null).map(entry=>entry.reason))].join(' · ');
      const advice=$('advice');
      advice.classList.toggle('wait',!best||pending||c.expired);
      let label,detail;
      if((c.expired||pending&&filterImages)&&(best||fallback||provisional)){
        const previous=best??fallback??provisional;
        label=[best?'Letzter Tipp':'Letzter Versuchstipp',pos[previous.position??previous.index],previous.name].filter(Boolean).join(' · ');
        detail=['Zuletzt angezeigtes Wahlfenster.',previous.reason].filter(Boolean).join(' ');
      }else if(pending&&filterImages){
        label='Letztes Wahlfenster';
        detail='Neuere Aufnahmen werden geprüft oder zeigen Zwischenbilder.';
      }else if(pending){
        label='Neue Aufnahme läuft';
      }else if(c.expired){
        label='Tipp abgelaufen';
      }else if(best){
        label=`Tipp · ${pos[best.index]} · ${best.name}`;
        detail=best.reason;
      }else if(fallback){
        label=['Versuchstipp',pos[fallback.position],fallback.name].filter(Boolean).join(' · ');
        detail=fallback.reason;
      }else if(provisional){
        label=`Vorläufig · ${pos[provisional.index]} · ${provisional.name}`;
        detail=reasons||'Sonderangebot: Mengen und Bestand prüfen.';
      }else{
        label='Kein sicherer Tipp';
        detail=reasons||'Keine ausreichenden Wahlangebote erkannt.';
      }
      advice.textContent=displayCardNames(label);
      advice.title=displayCardNames(detail?`${label}. ${detail}`:label);
    }
  }
  canTapImage=!prep&&conn.status==='device'&&!!current?.frame&&current.frame.target===state.device;
  screenshot.parentElement.classList.toggle('direct-tap',canTapImage);
  renderTacticFeedback(current);
  $('history').replaceChildren();for(const h of state.history)$('history').append(textEl('div',`${h.title} · ${Math.round(h.visionMs)} ms Erkennung · ${(h.ageMs/1000).toFixed(2)} s gesamt${h.expired?' · abgelaufen':''}`));
}
$('show-intermediates').onchange=()=>{
  rememberPreferences({showIntermediates:$('show-intermediates').checked});
  return action(()=>{});
};
await action(async()=>{
  const state=await fetchState().then(response=>response.json());
  lastTapSoundId=state.autoTapResult?.id??0;
  if(state.hasAudioClient||state.auto||state.capturing||state.recognizing)return;
  const mode=['arena','draft','prep'].includes(preferences.mode)?preferences.mode:state.mode;
  const settings={};
  if(state.gameLanguage!==language)settings.gameLanguage=language;
  if(mode!==state.mode)settings.mode=mode;
  if(mode!=='prep'&&typeof preferences.autoTap==='boolean')settings.autoTap=preferences.autoTap;
  if(Object.keys(settings).length)await post('/api/settings',{...settings,restoreBrowser:true});
});
async function pollState(){
  try{await refresh();}
  catch(e){$('connection').textContent='Lokaler Server nicht erreichbar';$('connection').dataset.status='error';$('capture').disabled=true;$('auto').disabled=true;canTapImage=false;screenshot.parentElement.classList.remove('direct-tap');speech?.cancel();error(e);}
  finally{setTimeout(pollState,350);}
}
setTimeout(pollState,350);
window.addEventListener('beforeunload',()=>{stopMic();speech?.cancel();fetch('/api/browser/leave',{method:'POST',keepalive:true,headers:{...browserHeaders,'X-Coach-Token':config.token}}).catch(()=>{});});
