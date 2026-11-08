import {tacticText,reviewMessage,reviewTapReason,displayNames,translate} from './language.mjs';
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
    const review=node.parentElement?.dataset.reviewKey;
    if(review){
      const value=reviewMessage(review,language);
      if(node.data!==value)node.data=value;
      return;
    }
    if(node.parentElement?.closest('[data-review-original],.quick-user,script,style,textarea'))return;
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
  stopQuickDictation();
  language=$('language').value==='en'?'en':'de';
  rememberPreferences({language});
  stopMic();
  speech?.cancel();
  applyLanguage();
  if(current&&coachView==='game')renderOffers(current);
  if(coachView==='tactics'&&tacticsData){
    renderTactics(tacticsData);
    editTactic(listedTactics.find(rule=>rule.id===editingTactic));
  }
  if(coachView==='review'){renderReviewMatches();renderReviewCaptures();renderPreferredOffers();renderReviewFacts();renderReviewCases(reviewCases);}
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
let spokenChoice='',spokenSpell='',spokenSpellSlots=0,muteThroughId=0,manualCapturePending=false;
const spellSpeechKey=(matchId,position,name)=>JSON.stringify([matchId,position,name]);
function speakTip(position,name){
  speech.cancel();
  const utterance=new SpeechSynthesisUtterance([translate(position,language),displayNames(name,language)].filter(Boolean).join('. '));
  utterance.lang=language==='en'?'en-US':'de-DE';
  speech.speak(utterance);
}
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
  const sent=state.lastSpellTap;
  if(sent?.name&&sent.id>muteThroughId&&sent.mode===state.mode&&sent.matchId===frame?.matchId&&Date.now()-sent.time<6000){
    const key=spellSpeechKey(sent.matchId,pos[sent.position],sent.name);
    if(key!==spokenSpell){
      spokenSpell=key;
      speakTip(pos[sent.position],sent.name);
      return;
    }
  }
  if(!frame||frame.id<=muteThroughId||frame.mode!==state.mode||frame.source==='reference'||frame.expired||Date.now()-frame.started>6000)return;
  const spell=frame.phase==='spell_choice';
  if(frame.advice?.reroll)return;
  if(!spell&&spokenSpellSlots){
    spokenSpellSlots=0;
    spokenChoice='';
  }
  if(frame.phase==='battle'){
    spokenChoice='';
    return;
  }
  if(frame.sentChoice)return;
  const {best,fallback,provisional}=frame.advice;
  const tip=best??fallback??provisional;
  if(!tip||(spell&&!tip.name))return;
  const offer=frame.offers[tip.index];
  const position=pos[tip.position??offer?.position??tip.index];
  // After a multi-card spell offer, the confirmed card can remain visible on its own.
  if(spell&&spokenSpellSlots>1&&frame.offers.length===1)return;
  if(spell){
    spokenSpellSlots=frame.offers.length;
    const key=spellSpeechKey(frame.matchId,position,tip.name);
    if(key===spokenSpell)return;
    spokenSpell=key;
  }
  const choice=JSON.stringify([frame.phase,position,tip.name,offer?.action,offer?.quantity]);
  if(choice===spokenChoice)return;
  spokenChoice=choice;
  speakTip(position,tip.name);
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
let errorTimer;
const loggedErrors=[];
let loggedMatches=[],loggedTimings=[],loggedRecognitionIssues=[],activityLogKey;
function error(e){
  const banner=$('error');
  banner.textContent=e.message||String(e);
  banner.hidden=false;
  loggedErrors.unshift({at:Date.now(),message:banner.textContent});
  if(loggedErrors.length>20)loggedErrors.pop();
  renderActivityLog();
  clearTimeout(errorTimer);
  errorTimer=setTimeout(()=>{banner.hidden=true;banner.textContent='';},8000);
}
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
const viewHints={review:'Partie auswerten',quick:'Fragen aus dem lokalen Taktiklexikon beantworten.',tactics:'Regeln, Testvorschauen und Notizen bearbeiten.',admin:'Partien archivieren und SQLite-Sicherungen herunterladen.',help:'Anleitung und Antworten auf häufige Fragen.'};
function showCoachView(view){
  if(view!=='quick')stopQuickDictation();
  coachView=view;
  $('game-view').hidden=view!=='game';
  $('quick-panel').hidden=view!=='quick';
  $('tactics-panel').hidden=view!=='tactics';
  $('review-panel').hidden=view!=='review';
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
    if(mode==='review')void openReview();
    if(mode==='admin'){void updateArchive();void loadAiSettings();}
    if(mode==='tactics')void openTactics();
    return;
  }
  showCoachView('game');
  if(mode===gameMode){void refresh();return;}
  return action(async()=>{
    await post('/api/settings',{mode,autoTap:mode!=='prep'&&preferences.autoTap===true,
      continuum:mode!=='prep'&&preferences.continuum===true});
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
$('suggest-lineup').onclick=async()=>{
  const button=$('suggest-lineup');
  const panel=$('lineup-suggestion');
  button.disabled=true;
  panel.hidden=false;
  panel.replaceChildren();
  try{
    const response=await fetch('/api/preparation/recommendation');
    if(!response.ok)throw Error('Vorschlag konnte nicht geladen werden.');
    const suggestion=await response.json();
    for(const [heading,cards] of [['Empfohlene Einheiten',suggestion.units],['Empfohlene Zauber',suggestion.spells]]){
      panel.append(textEl('h3',heading));
      if(!cards.length){
        panel.append(textEl('p','Keine Karten gespeichert.'));
        continue;
      }
      const list=document.createElement('ul');
      for(const card of cards){
        const level=card.bottom_badge==null?'':`Stufe ${card.bottom_badge}`;
        const item=document.createElement('li');
        item.append(textEl('strong',card.name),' · ');
        if(level)item.append(textEl('span',level),' · ');
        item.append(textEl('span',card.purpose));
        list.append(item);
      }
      panel.append(list);
    }
  }catch(e){panel.append(textEl('p',e.message));}
  finally{button.disabled=false;}
};
function showSavedCollection(collection) {
  $('collection-footer').textContent='Draft Coach · '+(config.version??(language==='en'?'Version unknown':'Version unbekannt'))+' · Build '+(config.build??(language==='en'?'unknown':'unbekannt'))+' · '+collection.units.units.length+' '+(language==='en'?'units':'Einheiten')+' · '+collection.spells.spells.length+' '+(language==='en'?'spells':'Zauber');
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
$('auto').onclick=()=>{
  armTapAudio();
  return action(()=>post('/api/settings',{auto:true,gameLanguage:language,autoTap:preferences.autoTap??$('auto-tap').checked,
    continuum:gameMode!=='prep'&&(preferences.continuum??$('continuum').checked)}));
};
$('continuum').onchange=()=>{
  const enabled=$('continuum').checked;
  return action(async()=>{
    await post('/api/settings',{continuum:enabled});
    rememberPreferences({continuum:enabled});
  });
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
  rec.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++){if(!e.results[i].isFinal)continue;const text=e.results[i][0].transcript.toLowerCase().trim();if(/\b(stopp?|ende|end)\b/.test(text)){$('stop').click();return;}if(/\b(jetzt|klick|click|start|now)\b/.test(text)&&Date.now()-lastVoiceAt>1200){lastVoiceAt=Date.now();$('capture').click();}}};
  rec.onerror=e=>{if(['not-allowed','service-not-allowed','audio-capture','network'].includes(e.error)){stopMic();error(Error('Spracherkennung nicht verfügbar ('+e.error+'). Aufnahmebutton bleibt nutzbar.'));}};
  rec.onend=()=>{if(mic===rec)mic=null;if(armed)setTimeout(listen,350);};
  try{rec.start();}catch{stopMic();error(Error('Mikrofon konnte nicht gestartet werden.'));}
}
$('mic').onclick=()=>{if(armed){stopMic();return;}armed=true;$('mic').textContent='Mikrofon aus';$('mic').classList.add('listening');listen();};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&coachView==='game'&&!matchDialog.open&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();$('capture').click();}});
const phaseNames={unknown:'Bildschirm unklar',deck_choice:'Deckwahl',battle:'Spielfeld',battle_choice:'Wahl im Kampf',spell_choice:'Zauberauswahl',collection:'Einheitensammlung',spells:'Zaubersammlung',gewonnen:'Gewonnen',verloren:'Verloren'};
const pos=['Links','Mitte','Rechts','Vierte Karte'];
function textEl(tag,text,cls){const e=document.createElement(tag);e.textContent=displayCardNames(text);if(cls)e.className=cls;return e;}
if(config.localAdmin)$('organization-options').append(new Option('Admin · Archiv','admin'));
if(config.localAdmin)$('organization-options').append(new Option('Partie auswerten','review'));
let reviewedFrame=null,reviewGptEnabled=false,reviewData=null,reviewCases=[],reviewGames=[],reviewGame=null;
const reviewForm=$('review-form');
const reviewRoot='/api/admin/review/';
function reviewText(key){
  const span=document.createElement('span');
  span.dataset.reviewKey=key;
  span.textContent=reviewMessage(key,language);
  return span;
}
function reviewLine(key,contents){
  const row=document.createElement('p');
  row.append(reviewText(key),' · ',...contents);
  return row;
}
function reviewCard(card){
  const span=document.createElement('span');
  span.append(card?.name?document.createTextNode(card.name):reviewText('unknown'));
  if(card?.action&&reviewMessage(card.action,language)){
    span.append(' · ',reviewText(card.action));
    if(card.quantity!=null)span.append(' '+card.quantity);
  }
  return span;
}
function reviewList(items){
  return items.length?items.flatMap((item,index)=>index?[' / ',item]:[item]):['—'];
}
async function reviewGet(name){
  const response=await fetch(reviewRoot+name);
  const data=await response.json();
  if(!response.ok)throw Error(data.error);
  return data;
}
async function reviewAction(work){
  $('review-message').textContent='';
  try{await work();}catch(error){$('review-message').textContent=error.message;}
}
function clearReviewFrame(){
  reviewedFrame=null;
  reviewData=null;
  reviewForm.hidden=true;
  $('review-banner').hidden=true;
  $('review-gpt').hidden=true;
  $('review-image').hidden=true;
  $('review-before-heading').hidden=true;
  $('review-variant').hidden=true;
  $('review-variant').replaceChildren();
  $('review-facts').replaceChildren();
  $('review-comparison').replaceChildren();
}
async function loadReviewCaptures(){
  clearReviewFrame();
  const captures=$('review-capture');
  captures.replaceChildren();
  if(!$('review-match').value)return;
  const game=await reviewGet('match?id='+encodeURIComponent($('review-match').value));
  reviewGame=game;
  renderReviewCaptures();
}
function renderReviewCaptures(){
  if(!reviewGame||reviewGame.id!==$('review-match').value)return;
  const captures=$('review-capture'), selected=captures.value;
  const {frames,captureIds}=reviewGame;
  captures.replaceChildren();
  const recorded=new Set(frames.map(frame=>frame.id));
  for(const frame of frames){
    captures.append(new Option([frame.id,reviewMessage(frame.phase,language)||phaseNames[frame.phase],
      displayNames(frame.tip??frame.clicked??'',language)].filter(Boolean).join(' · '),frame.id));
  }
  const other=document.createElement('optgroup');
  other.label=translate('Weitere Aufnahmen',language);
  for(const id of captureIds)if(!recorded.has(id))other.append(new Option(String(id),id));
  if(other.children.length)captures.append(other);
  if([...captures.options].some(option=>option.value===selected))captures.value=selected;
}
function renderReviewMatches(){
  const matches=$('review-match'),selected=matches.value;
  const extra=[...matches.options].filter(option=>!reviewGames.some(game=>game.id===option.value));
  matches.replaceChildren(...reviewGames.map(game=>new Option(
    [new Date(game.ended).toLocaleString(language),reviewMessage(game.mode,language),
      reviewMessage(game.outcome,language)].join(' · '),game.id)),...extra);
  if([...matches.options].some(option=>option.value===selected))matches.value=selected;
}
async function openReview(){
  await reviewAction(async()=>{
    clearReviewFrame();
    const {games,cards,gpt}=await reviewGet('matches');
    reviewGptEnabled=gpt;
    $('review-banner-name').replaceChildren(...cards.map(card=>new Option(displayCardNames(card),card)));
    reviewGames=games;
    renderReviewMatches();
    for(const field of ['offer','enemy'])reviewForm.elements.namedItem(field).replaceChildren(
      new Option(translate(field==='enemy'?'Jeder Gegner':'Keine Karte · Notiz',language),''),
      ...cards.map(card=>new Option(displayCardNames(card),card)));
    $('review-language').value=language;
    await loadReviewCaptures();
    renderReviewCases(await reviewGet('cases'));
  });
}
$('close-review').onclick=returnToGame;
$('review-match').onchange=()=>reviewAction(loadReviewCaptures);
$('review-capture').onchange=clearReviewFrame;
async function loadReviewFrame(){
  clearReviewFrame();
  const matchId=$('review-match').value, capture=Number($('review-capture').value);
  if(!matchId||!capture)return;
  const data=await post(reviewRoot+'frame',{matchId,capture,language:$('review-language').value});
  if(matchId!==$('review-match').value||capture!==Number($('review-capture').value))return;
  const {frame,replay}=data;
  reviewedFrame={matchId,capture,language:frame.language,phase:frame.phase};
  const image=$('review-image');
  image.src=reviewRoot+'image?id='+encodeURIComponent(matchId)+'&capture='+capture;
  image.hidden=false;
  image.onerror=()=>{image.hidden=true;};
  if(data.variantEvidence){
    $('review-before-heading').hidden=false;
    const panel=$('review-variant');
    const title=textEl('h3','Spielfeld nach der Variantenwahl');
    const detail=textEl('p','Aufnahme '+data.variantEvidence.after);
    const after=document.createElement('img');
    after.className='review-image';
    after.alt='Spielfeld nach der Variantenwahl';
    after.onerror=()=>{after.hidden=true;detail.textContent='Folgeaufnahme nicht verfügbar.';};
    after.src=reviewRoot+'image?id='+encodeURIComponent(matchId)+'&capture='+data.variantEvidence.after;
    panel.append(title,after,detail);
    panel.hidden=false;
  }
  reviewForm.reset();
  reviewForm.hidden=false;
  $('review-banner').hidden=false;
  $('review-gpt').hidden=!reviewGptEnabled;
  $('review-gpt-image').checked=false;
  reviewData=frame;
  renderPreferredOffers();
  renderReviewFacts();
  showReviewComparison(replay,[]);
}
$('review-load').onclick=()=>reviewAction(loadReviewFrame);
function renderPreferredOffers(){
  if(!reviewData)return;
  const field=reviewForm.elements.namedItem('preferredOffer'),selected=field.value;
  field.replaceChildren(new Option(reviewMessage('noPreference',language),''),
    ...reviewData.offers.map((card,index)=>new Option(
      [index+1,card.name?displayNames(card.name,language):reviewMessage('unknown',language),
        reviewMessage(card.action,language),card.quantity].filter(value=>value!=null&&value!=='').join(' · '),String(index))));
  if([...field.options].some(option=>option.value===selected))field.value=selected;
}
function renderReviewFacts(){
  if(!reviewData)return;
  const frame=reviewData;
  const tip=frame.advice?.best??frame.advice?.fallback??frame.advice?.provisional;
  const clicks=frame.clicks.map(click=>{
    const detail=document.createElement('span');
    if(click.karte)detail.append(click.karte,' · ');
    detail.append(reviewText(click.ergebnis));
    if(click.grund){
      const reason=document.createElement('span');
      reason.dataset.reviewOriginal='';
      reason.textContent=reviewTapReason(click.grund,language);
      detail.append(' · ',reason);
    }
    return detail;
  });
  $('review-facts').replaceChildren(
    reviewLine('offers',reviewList(frame.offers.map(reviewCard))),
    reviewLine('enemies',reviewList((frame.enemy??[]).map(reviewCard))),
    reviewLine('original',[tip?.name??'—']),
    reviewLine('clicks',reviewList(clicks)));
}
$('review-banner-save').onclick=()=>reviewAction(async()=>{
  if(!reviewedFrame)return;
  const action=$('review-banner-action').value;
  const cases=await post(reviewRoot+'banner',{...reviewedFrame,name:$('review-banner-name').value,action,
    quantity:action==='multiply'?2:Number($('review-banner-quantity').value)});
  renderReviewCases(cases);
  $('review-message').textContent='Erkennungsvorlage gespeichert.';
});
$('review-gpt-run').onclick=()=>reviewAction(async()=>{
  if(!reviewedFrame)return;
  const button=$('review-gpt-run'), selected=reviewedFrame;
  button.disabled=true;
  $('review-message').textContent='GPT erstellt einen Entwurf …';
  try{
    const {observation,rule}=await post(reviewRoot+'gpt',{...selected,uiLanguage:language,
      includeImage:$('review-gpt-image').checked,observation:reviewForm.elements.namedItem('observation').value});
    if(reviewedFrame!==selected)return;
    reviewForm.elements.namedItem('observation').value=observation;
    for(const field of ['title','offer','enemy','mode','action','weight']){
      if(rule)reviewForm.elements.namedItem(field).value=rule[field]??'';
    }
    $('review-message').textContent='Entwurf geladen. Prüfe ihn vor dem Speichern.';
  }finally{button.disabled=false;}
});
function reviewDraft(){
  if(!reviewedFrame)throw Error('Wähle zuerst ein Wahlfenster.');
  const {observation,title,mode,offer,enemy,action,weight,preferredOffer}=Object.fromEntries(new FormData(reviewForm));
  const phase=['battle_choice','deck_choice','spell_choice'].includes(reviewedFrame.phase)?reviewedFrame.phase:'alle';
  const rule=title||offer?{title,reason:observation,mode,phase,offer,enemy,action,weight:Number(weight),textLanguage:language}:null;
  return {...reviewedFrame,observation,rule,preferredOffer:preferredOffer===''?null:Number(preferredOffer)};
}
function showReviewComparison(replay,comparisons){
  const panel=$('review-comparison');
  panel.replaceChildren();
  const choice=pick=>pick?reviewCard(pick):'—';
  panel.append(reviewLine('baseline',[choice(replay.before)]),reviewLine('proposed',[choice(replay.after)]));
  if(replay.after?.reason){
    const reason=document.createElement('span');
    reason.dataset.reviewOriginal='';
    reason.textContent=replay.after.reason;
    const details=document.createElement('details');
    const summary=document.createElement('summary');
    summary.append(reviewText('reason'));
    details.append(summary,reason);
    panel.append(details);
  }
  for(const row of comparisons){
    const line=document.createElement('p');
    line.append(row.capture+' · ',choice(row.before),' → ',choice(row.after));
    panel.append(line);
  }
}
$('review-preview').onclick=()=>reviewAction(async()=>{
  const data=await post(reviewRoot+'preview',reviewDraft());
  showReviewComparison(data.replay,data.comparisons);
});
reviewForm.onsubmit=event=>{
  event.preventDefault();
  void reviewAction(async()=>{
    await post(reviewRoot+'save',reviewDraft());
    $('review-message').textContent='Prüffall gespeichert.';
    renderReviewCases(await reviewGet('cases'));
  });
};
function renderReviewCases(cases){
  reviewCases=cases;
  const panel=$('review-cases');
  panel.replaceChildren();
  for(const item of cases){
    const article=document.createElement('article');
    const details=document.createElement('p');
    const note=document.createElement('span');
    note.dataset.reviewOriginal='';
    note.textContent=[item.rule?tacticText(item.rule,language)?.title:null,item.observation].filter(Boolean).join(' · ');
    details.append(item.capture+' · ',note);
    if(item.preferred)details.append(' · ',reviewText('preference'),' · ',reviewCard(item.preferred));
    if(item.revision?.status)details.append(' · ',reviewText(item.revision.status));
    article.append(details);
    const open=document.createElement('button');
    open.type='button';
    open.append(reviewText('openCase'));
    open.onclick=()=>reviewAction(async()=>{
      const matches=$('review-match');
      if(![...matches.options].some(option=>option.value===item.matchId)){
        matches.append(new Option(item.matchId,item.matchId));
      }
      matches.value=item.matchId;
      await loadReviewCaptures();
      $('review-capture').value=String(item.capture);
      if(item.template?.language)$('review-language').value=item.template.language;
      await loadReviewFrame();
      if(!reviewedFrame)return;
      reviewForm.elements.namedItem('observation').value=item.observation??'';
      reviewForm.elements.namedItem('preferredOffer').value=item.preferred?String(item.preferred.index):'';
      if(item.rule)for(const field of ['title','offer','enemy','mode','action','weight']){
        reviewForm.elements.namedItem(field).value=(field==='title'?tacticText(item.rule,language)?.title:item.rule[field])??'';
      }
    });
    article.append(open);
    if(item.template){
      const button=textEl('button',item.template.enabled?'Vorlage deaktivieren':'Vorlage aktivieren','small');
      button.type='button';
      button.onclick=()=>reviewAction(async()=>renderReviewCases(await post(reviewRoot+'template',{id:item.id,enabled:!item.template.enabled})));
      article.append(button);
    }
    if(item.rule){
      for(const [status,label] of [['test','Testregel'],['aktiv','Aktivieren'],['zurueck','Zurücknehmen']]){
        const button=textEl('button',label,'small');
        button.type='button';
        button.onclick=()=>reviewAction(async()=>renderReviewCases(await post(reviewRoot+'rule',{id:item.id,status})));
        article.append(button);
      }
    }
    panel.append(article);
  }
}
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
const quickMic=$('quick-mic');
const QuickRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let quickRecognition=null;
quickMic.disabled=!QuickRecognition;
if(!QuickRecognition)$('quick-mic-status').textContent='Spracheingabe ist in diesem Browser nicht verfügbar.';
function stopQuickDictation(){
  const active=quickRecognition;
  quickRecognition=null;
  active?.abort();
  quickMic.setAttribute('aria-pressed','false');
  quickMic.classList.remove('listening');
  quickMic.textContent='Frage diktieren';
  if(QuickRecognition)$('quick-mic-status').textContent='';
}
quickMic.onclick=()=>{
  if(quickRecognition){stopQuickDictation();return;}
  if(!QuickRecognition)return;
  stopMic();
  const recognition=new QuickRecognition();
  quickRecognition=recognition;
  recognition.lang=language==='en'?'en-US':'de-DE';
  recognition.continuous=false;
  recognition.interimResults=false;
  const status=$('quick-mic-status');
  const finish=message=>{
    if(quickRecognition!==recognition)return false;
    quickRecognition=null;
    quickMic.setAttribute('aria-pressed','false');
    quickMic.classList.remove('listening');
    quickMic.textContent='Frage diktieren';
    status.textContent=message;
    return true;
  };
  recognition.onresult=event=>{
    const text=event.results[event.resultIndex]?.[0]?.transcript?.trim();
    if(!text||!finish('Frage übernommen. Prüfe sie vor dem Absenden.'))return;
    const input=$('quick-question');
    input.value=text.slice(0,input.maxLength);
    input.focus();
  };
  recognition.onerror=event=>finish(event.error==='not-allowed'||event.error==='service-not-allowed'?
    'Mikrofonzugriff wurde nicht freigegeben.':'Spracheingabe fehlgeschlagen. Du kannst die Frage eintippen.');
  recognition.onend=()=>finish('Keine Frage erkannt. Versuche es erneut.');
  try{
    recognition.start();
    quickMic.setAttribute('aria-pressed','true');
    quickMic.classList.add('listening');
    quickMic.textContent='Diktat abbrechen';
    status.textContent='Ich höre zu …';
  }catch{finish('Spracheingabe konnte nicht gestartet werden.');}
};
const quickForm=$('quick-form');
const quickSource=$('quick-source');
let previousAiTurn='';
function updateQuickAi(enabled){
  quickSource.value=enabled?'ai':'local';
  quickSource.querySelector('[value="ai"]').disabled=!enabled;
  $('quick-ai-hint').hidden=enabled;
  $('quick-key-settings').hidden=enabled||!config.localAdmin;
}
updateQuickAi(Boolean(config.quickAiEnabled));
$('quick-key-settings').onclick=()=>{
  showCoachView('admin');
  void updateArchive();
  void loadAiSettings();
  $('ai-key').focus();
};
function showAiSettings(settings){
  $('ai-key-remove').hidden=!settings.stored;
  $('ai-key-status').textContent=settings.enabled?
    'KI ist eingerichtet. Der Schlüssel wird beim nächsten KI-Aufruf geprüft.':'Kein OpenAI-API-Key eingerichtet.';
}
async function loadAiSettings(){
  try{
    const response=await fetch('/api/admin/ai');
    if(!response.ok)throw Error('KI-Einstellungen konnten nicht geladen werden.');
    showAiSettings(await response.json());
  }catch(error){$('ai-key-status').textContent=error.message;}
}
async function changeAiKey(key){
  const form=$('ai-key-form');
  for(const control of form.elements)control.disabled=true;
  try{
    const settings=await post('/api/admin/ai',{key});
    $('ai-key').value='';
    showAiSettings(settings);
    updateQuickAi(settings.enabled);
  }catch(error){$('ai-key-status').textContent=error.message;}
  finally{for(const control of form.elements)control.disabled=false;}
}
$('ai-key-form').onsubmit=event=>{
  event.preventDefault();
  const key=$('ai-key').value.trim();
  if(key)void changeAiKey(key);
};
$('ai-key-remove').onclick=()=>void changeAiKey('');
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
function renderQuickAiAnswer(reply,text){
  const content=document.createElement('div');
  content.className='quick-ai-answer';
  content.dataset.reviewOriginal='';
  let list=null;
  const append=(element,line)=>{
    for(const [index,part] of line.split(/\*\*([^*]+)\*\*/).entries()){
      if(index%2){
        const emphasis=document.createElement('strong');
        emphasis.textContent=part;
        element.append(emphasis);
      }else element.append(part);
    }
  };
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(!line){list=null;continue;}
    const bullet=/^(?:[-*•]|\d+[.)])\s+(.+)$/.exec(line);
    if(bullet){
      const kind=/^\d/.test(line)?'ol':'ul';
      if(list?.localName!==kind){
        list=document.createElement(kind);
        content.append(list);
      }
      const item=document.createElement('li');
      append(item,bullet[1]);
      list.append(item);
    }else{
      list=null;
      const heading=/^#{1,6}\s+(.+)$/.exec(line);
      const block=document.createElement(heading?'h3':'p');
      append(block,heading?.[1]??line);
      content.append(block);
    }
  }
  reply.append(content);
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
    const source=quickSource.value;
    const result=await post('/api/schnellauskunft',{question,context,language,source,previous:source==='ai'?previousAiTurn:undefined});
    if(result.source==='ai')previousAiTurn=(question+'\n'+result.summary).slice(0,1200);
    if(result.subjects.length)quickSubjects=result.subjects;
    if(result.entries.length||result.source==='ai')rememberQuestion(question,result.subjects);
    if(result.source==='ai')renderQuickAiAnswer(reply,result.summary);
    else reply.append(textEl('p',result.summary));
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
for(const button of document.querySelectorAll('#quick-examples button')){
  button.onclick=()=>{
    if(quickForm.querySelector('button[type="submit"]').disabled)return;
    $('quick-question').value=button.textContent;
    quickForm.requestSubmit();
  };
}
const tacticsForm=$('tactics-form');
const tacticStatuses={notiz:'Notiz',test:'Testvorschau',aktiv:'Aktiv'};
let editingTactic=null;
let listedTactics=[],tacticsData=null;
let changingTactic=false;
function editTactic(rule){
  editingTactic=rule?.id??null;
  $('tactics-form-title').textContent=rule?'Erkenntnis bearbeiten':'Neue Erkenntnis';
  tacticsForm.reset();
  const text=rule?tacticText(rule,language):null;
  if(rule)for(const name of ['mode','phase','offer','enemy','weight','status','action'])
    tacticsForm.elements.namedItem(name).value=rule[name]??'';
  for(const field of ['title','reason'])tacticsForm.elements.namedItem(field).value=text?.[field]??'';
  const note=$('tactics-text-language');
  const hint=text?.stale?'Übersetzung prüfen.':text?.machine?'Automatisch übersetzt.':rule&&!text?'Für diese Sprache fehlt der Regeltext.':
    'Titel und Begründung gelten für die gewählte Textsprache.';
  note.replaceChildren(translate('Textsprache',language)+' · '+(language==='en'?'English':'Deutsch')+' · '+translate(hint,language));
  $('tactics-message').textContent=rule?.evidence?.length?
    (language==='en'?'Archived evidence · ':'Belegbilder im Archiv · ')+rule.evidence.join(', '):'';
  $('delete-tactic').hidden=!rule;
  for(const row of $('tactics-list').querySelectorAll('button'))
    row.setAttribute('aria-pressed',String(row.dataset.ruleId===editingTactic));
}
function renderTactics(data){
  tacticsData=data;
  const {rules,cards,baseCount}=data;
  listedTactics=rules;
  $('tactics-total').textContent=rules.length+(language==='en'?' rules':' Einträge');
  $('tactics-sources').textContent=Number.isInteger(baseCount)
    ?(language==='en'
      ?`Quick Advice also uses ${baseCount} base entries and saved combinations. Edit tactical rules here.`
      :`Zusätzlich nutzt die Schnellauskunft ${baseCount} Einträge aus dem Basislexikon und hinterlegte Kombinationshinweise. Hier bearbeitest du die Taktikregeln.`)
    :'';
  for(const [name,empty] of [['offer','Keine Karte · Notiz'],['enemy','Jeder Gegner']]){
    const field=tacticsForm.elements.namedItem(name);
    field.replaceChildren(new Option(empty,''),...cards.map(card=>new Option(displayNames(card,language),card)));
  }
  renderTacticList();
}
function renderTacticList(){
  const normalize=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('de');
  const words=normalize($('tactics-search').value.trim()).split(/\s+/).filter(Boolean);
  const status=$('tactics-filter').value;
  const title=rule=>tacticText(rule,language)?.title??translate('Für diese Sprache fehlt der Regeltext.',language);
  const matches=listedTactics.filter(rule=>{
    if(status&&rule.status!==status)return false;
    const haystack=normalize([title(rule),tacticText(rule,language)?.reason,displayNames(rule.offer,language),
      displayNames(rule.enemy,language)].filter(Boolean).join(' '));
    return words.every(word=>haystack.includes(word));
  }).sort((a,b)=>title(a).localeCompare(title(b),language));
  $('tactics-found').textContent=language==='en'?`${matches.length} of ${listedTactics.length} rules`:`${matches.length} von ${listedTactics.length} Einträgen`;
  const list=$('tactics-list');
  list.replaceChildren();
  for(const rule of matches){
    const weight=rule.weight>0?'+'+rule.weight:String(rule.weight);
    const button=textEl('button','','tactics-row');
    button.type='button';
    button.dataset.ruleId=rule.id;
    button.setAttribute('aria-pressed',String(rule.id===editingTactic));
    const label=document.createElement('strong');
    label.dataset.reviewOriginal='';
    label.textContent=title(rule);
    button.append(label,textEl('small',translate(tacticStatuses[rule.status],language)+' · '+weight+' '+(language==='en'?'points':'Punkte'),'muted'));
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
  if(changingTactic||!rule||!window.confirm(language==='en'?'Delete this rule in both languages?':'Regel in beiden Sprachen löschen?'))return;
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
    const result=await post('/api/taktikregeln',{...data,id,weight:Number(data.weight),textLanguage:language});
    renderTactics(result);
    editTactic(result.rules.find(rule=>rule.id===id)??result.rules.at(-1));
    $('tactics-message').textContent=result.translation==='failed'?'Regel gespeichert. Automatische Übersetzung fehlgeschlagen.':
      result.translation==='saved'?'Regel und automatische Übersetzung gespeichert.':'Gespeichert.';
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
  feedback.title=displayCardNames([...new Set([...applied,...tested].flatMap(card=>card.rules.flatMap(rule=>{const text=tacticText(rule,language);return text?[text.title+' · '+text.reason]:[];})))].join('\n'));
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
  return result.source!=='reference'&&!result.reviewed&&!result.sentChoice&&card.box?.length===4&&
    ['deck_choice','battle_choice','spell_choice'].includes(result.phase);
}
function offerKey(result,card){
  return [card.position,card.name,card.action,card.quantity,card.variantIndex,card.variantIndex?language:null,!!canChoose(result,card),
    card.action==='spell'?card.orange?.value:null];
}
function draw(result,sentTap){
  const groups=['offers','enemy','own'];
  const best=result.advice?.best;
  const tentative=result.advice?.fallback??result.advice?.provisional;
  const tip=result.sentChoice??(result.advice?.reroll?null:best??tentative);
  const sentIndex=result.sentChoice?.index??(sentTap?.id===result.id?sentTap.index:null);
  const key=JSON.stringify([result.geometry,tip?.index,best?.index,sentIndex,groups.map(group=>(result[group]||[]).map(card=>[card.box,!!card.name]))]);
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
      const stroke=highlighted?(best?.index===index?'#60f394':'#ffdc58'):(card.name?'#bcf388':'#b7c1cf');
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
  const key=JSON.stringify([result.phase,result.advice?.expectedOffers,result.offers.map(card=>offerKey(result,card))]);
  if(key!==offersKey){
    offersKey=key;
    renderOfferRows(result);
  }
  $('board').replaceChildren();
  for(const [key,label] of [['enemy','Gegnerisches Deck'],['own','Eigenes Deck']]){
    const cards=(result[key]??[]).filter(card=>card.name&&Number.isInteger(card.position));
    if(cards.length)$('board').append(textEl('p',translate(label,language)+' · '+cards.map(card=>
      displayCardNames(card.name)+(card.orange?.value!=null?` (${card.orange.value})`:'')).join(', ')));
  }
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
  const cards=result.offers.length&&result.advice?.expectedOffers===3?
    Array.from({length:result.advice.expectedOffers},(_,position)=>
      result.offers.find(card=>card.position===position)??{position,name:null,action:'unknown'}):result.offers;
  for(const c of cards){
    const row=textEl('div','','offer');row.dataset.position=c.position;
    const details=textEl('div','','offer-details');
    details.append(textEl('strong',c.name||(result.phase==='spell_choice'?'Zauber nicht erkannt':'Figur nicht erkannt'),c.name?'':'offer-unknown'),
      textEl('span',offerAction(result.phase,c)+(c.variantIndex?` · ${language==='en'?'Variant':'Variante'} ${c.variantIndex}`:''),c.action==='unknown'?'offer-action offer-unknown':'offer-action'));
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
let lastServerError;
let timingTrendKey;
function renderTimingCharts(buckets){
  if(!$('live-log').open)return;
  const minute=Math.floor(Date.now()/60000);
  const key=JSON.stringify([minute,language,buckets]);
  if(key===timingTrendKey)return;
  timingTrendKey=key;
  const container=$('timing-charts');
  const recent=buckets.filter(bucket=>bucket.minute>minute-60&&bucket.minute<=minute);
  if(!recent.length){
    container.replaceChildren(textEl('p','Noch keine Live-Messwerte.','muted'));
    return;
  }
  const clock=new Intl.DateTimeFormat(language==='en'?'en-GB':'de-DE',{hour:'2-digit',minute:'2-digit'});
  const duration=new Intl.NumberFormat(language,{maximumFractionDigits:2});
  const seconds=ms=>duration.format(ms/1000)+' s';
  const svgNode=(tag,attributes={})=>{
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [name,value] of Object.entries(attributes))node.setAttribute(name,value);
    return node;
  };
  container.replaceChildren(...[['captureMs','Aufnahme'],['visionMs','Erkennung'],['ageMs','Bild bis Ergebnis']].map(([field,label])=>{
    const peak=Math.max(...recent.map(bucket=>bucket[field]));
    const limit=Math.max(100,Math.ceil(peak/100)*100);
    const chart=textEl('div','','timing-chart');
    chart.append(textEl('strong',label),textEl('span',seconds(limit),'muted'));
    const svg=svgNode('svg',{viewBox:'0 0 240 68',role:'img',
      'aria-label':translate(label,language)+' · '+translate('Höchstwert',language)+' '+seconds(peak)});
    for(const y of [2,34,66])svg.append(svgNode('line',{x1:0,x2:240,y1:y,y2:y}));
    for(const bucket of recent){
      const height=Math.max(1,bucket[field]/limit*64);
      const bar=svgNode('rect',{x:(bucket.minute-minute+59)*4,y:66-height,width:3,height});
      const title=svgNode('title');
      title.textContent=clock.format(bucket.minute*60000)+' · '+seconds(bucket[field]);
      bar.append(title);
      svg.append(bar);
    }
    chart.append(svg,textEl('span',clock.format((minute-59)*60000),'muted'),textEl('span',clock.format(minute*60000),'muted'));
    return chart;
  }));
}
function renderActivityLog(){
  const key=JSON.stringify([language,loggedMatches,loggedTimings,loggedRecognitionIssues,loggedErrors]);
  if(key===activityLogKey)return;
  activityLogKey=key;
  const entries=[
    ...loggedMatches.map(game=>({at:game.ended,game})),
    ...loggedTimings.filter(timing=>timing.ageMs>2000&&Number.isFinite(timing.at)).map(timing=>({at:timing.at,timing})),
    ...loggedRecognitionIssues.map(issue=>({at:issue.at,recognition:issue})),
    ...loggedErrors
  ].sort((a,b)=>b.at-a.at);
  const log=$('history');
  if(!entries.length){
    log.textContent='Noch keine Log-Einträge.';
    return;
  }
  const dates=new Intl.DateTimeFormat(language==='en'?'en-GB':'de-DE',{dateStyle:'short',timeStyle:'medium'});
  log.replaceChildren(...entries.map(({at,game,timing,message,recognition})=>{
    const row=document.createElement('div');
    const timestamp=document.createElement('time');
    timestamp.dateTime=new Date(at).toISOString();
    timestamp.textContent=dates.format(at);
    row.append(timestamp,' · ');
    if(game){
      const gameLanguage={de:['Deutsch','German'],en:['Englisch','English']}[game.language];
      row.append(reviewText(game.mode),' · ',
        gameLanguage?.[language==='en'?1:0]??translate('Spielsprache offen',language),' · ',reviewText(game.outcome));
    }else if(timing){
      row.append(translate(timing.title,language),' · ',Math.round(timing.visionMs)+' ms ',
        translate('Erkennung',language),' · ',(timing.ageMs/1000).toFixed(3)+' s ',translate('gesamt',language));
      if(timing.expired)row.append(' · ',translate('abgelaufen',language));
    }else if(recognition){
      row.append(reviewText(recognition.phase),' · ');
      recognition.issues.forEach((issue,index)=>{
        if(index)row.append(' | ');
        const details=[];
        if(issue.missingName)details.push(recognition.phase==='spell_choice'?'Zauber nicht erkannt':'Figur nicht erkannt');
        if(issue.missingAction)details.push('Aktion nicht erkannt');
        if(issue.missingQuantity)details.push('Anzahl nicht erkannt');
        row.append(translate(pos[issue.position]??'Position',language),' · ',
          ...(issue.name?[displayNames(issue.name,language)+' · ']:[]),
          details.map(detail=>translate(detail,language)).join(' / '));
      });
      row.append(' · ',translate('Aufnahme',language),' ',String(recognition.captureId));
    }else{
      row.append(textEl('strong','Fehler','log-error'),' · ',message);
    }
    return row;
  }));
}
async function refresh(){
  const request=++refreshRequest;
  const r=await fetchState();if(!r.ok)throw Error('Server nicht erreichbar');const state=await r.json();
  if(request<renderedRequest)return;
  renderedRequest=request;
  const prep=state.mode==='prep', conn=state.connection||{status:'checking'};
  $('setup').hidden=!prep;
  if(!setupPath&&conn.transport)showSetupPath(conn.transport==='wifi'?'pair':'usb');
  const intermediates=$('show-intermediates');
  const filterImages=!prep&&!intermediates.checked&&(state.auto||state.current?.automatic);
  const displayed=filterImages?state.latestRelevant:state.current;
  $('auto-tap-control').hidden=prep;
  $('continuum-control').hidden=prep;
  $('continuum').checked=!!state.continuum;
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
    action==='multiply'?`${name} ×${quantity}`:action==='multiply_upgrade'?`${name} ×${quantity} UP!`:`${name} UP!`);
  $('enemy-events').hidden=!events.length;
  $('enemy-events').textContent=events.length?'Gegnerzüge · zuletzt je Figur · '+displayCardNames(eventLabels.join(' · ')):'';
  const connectionLabels={device:'Verbunden',missing:'Nicht verbunden',unauthorized:'Am Handy freigeben',offline:'Gerät offline',checking:'ADB wird geprüft',error:'ADB nicht erreichbar'};
  const selectedName=conn.model==='SM_A556B'?'Samsung Galaxy A55':(conn.model||conn.serial||state.device);
  const connectionLabel=connectionLabels[conn.status]||'ADB: '+conn.status;
  const connectionText=connectionLabel+' · '+selectedName+(conn.transport?' · '+(conn.transport==='wifi'?'WLAN':'USB'):'');
  const headerConnection=$('header-connection');
  if(headerConnection.textContent!==connectionLabel)headerConnection.textContent=connectionLabel;
  headerConnection.dataset.status=conn.status;
  headerConnection.title=connectionText;
  const setupConnection=$('setup-connection');
  if(setupConnection.textContent!==connectionText)setupConnection.textContent=connectionText;
  setupConnection.dataset.status=conn.status;
  setupConnection.title=(conn.serial||state.device)+(conn.otherDevices?' · Weitere erreichbare Verbindungen: '+conn.otherDevices:'');
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
  $('ready').textContent=state.ready?'Erkennung lokal bereit':'Erkennung nicht bereit';
  $('capture').disabled=manualCapturePending||(!prep&&!state.ready)||(!state.auto&&state.capturing)||conn.status!=='device';
  $('capture-label').textContent=prep?'Jetzt aufnehmen':'Manuell aufnehmen';
  $('probe').disabled=!state.ready||state.auto||state.capturing||state.recognizing||state.manualTapPending||conn.status!=='device';
  $('auto').disabled=state.auto||manualCapturePending||state.capturing||!state.ready||conn.status!=='device';
  $('auto').textContent=state.auto?'Automodus läuft':'Automodus starten';
  $('auto').dataset.running=String(state.auto);
  gameMode=state.modeSelection??state.mode;
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
  const detectedMode=$('detected-mode');
  detectedMode.hidden=coachView!=='game'||gameMode!=='auto';
  const detectedLabel=state.mode==='arena'?'Schlacht erkannt.':state.mode==='draft'?'Draft erkannt.':'Warte auf Spielmodus';
  const modeText=translate(detectedLabel,language);
  if(detectedMode.textContent!==modeText)detectedMode.textContent=modeText;
  $('mode-hint').textContent=viewHints[coachView]??(prep?'Einheiten und Zauber getrennt aufnehmen.':state.mode==='draft'?
    (draftLineup.length?'Aktives Draft-Deck · '+displayCardNames(draftLineup.join(', ')):'Noch kein Draft-Deck übernommen.')+
    (draftExtra.length?' · Neu im Spiel erkannt: '+displayCardNames(draftExtra.join(', ')):''):
    'Zauber immer nur aus deiner Auswahl.');
  if(coachView==='game'&&gameMode==='auto'){
    if(state.mode==='auto')$('mode-hint').textContent='Automodus vor dem Start im Spielmenü einschalten. Bei einem späten Einstieg Draft oder Schlacht manuell wählen.';
  }
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
  if(!state.auto&&displayed?.outcomeSaved){
    $('activity').textContent=reviewMessage(displayed.matchOutcome,language)+' · '+(language==='en'?'Result saved':'Ergebnis gespeichert');
  }
  if(state.continuing)$('activity').textContent=language==='en'?'Starting the next match…':'Nächste Partie wird gestartet …';
  if(state.error&&state.error!==lastServerError)error(Error(state.error));
  lastServerError=state.error;
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
  if(c){current=c;const pending=state.latestId>c.id;const a=JSON.stringify([c.phase,c.advice,c.sentChoice,c.expired,pending,filterImages]);if(c.id!==lastId){lastId=c.id;$('image-empty').hidden=true;document.querySelector('.image-wrap').hidden=false;$('screenshot').src=c.image;$('phase').textContent=phaseNames[c.phase]||c.phase;$('image-caption').textContent=c.source==='reference'?c.title+' · Gespeichertes Testbild':c.title;$('capture-time').textContent=(c.captureMs/1000).toFixed(2)+' s';$('vision-time').textContent=Math.round(c.visionMs)+' ms';$('total-time').textContent=(c.ageMs/1000).toFixed(2)+' s';renderOffers(c);}else if(a!==lastAdvice&&c.sentChoice)renderOffers(c);draw(c,state.lastCardTap);
    if(a!==lastAdvice){
      lastAdvice=a;
      const {best,provisional,fallback}=c.advice;
      const reasons=[...new Set(c.advice.evaluated?.filter(entry=>entry.score===null).map(entry=>entry.reason))].join(' · ');
      const advice=$('advice');
      advice.classList.toggle('wait',!best||pending||c.expired||c.advice.reroll);
      let label,detail;
      if(c.sentChoice){
        label=['Auswahl gesendet',pos[c.offers[c.sentChoice.index]?.position??c.sentChoice.index],c.sentChoice.name].filter(Boolean).join(' · ');
      }else if((c.expired||pending&&filterImages)&&(best||fallback||provisional)){
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
      }else if(c.advice.reroll){
        label=language==='en'?'Reroll for a ranged unit':'Für Fernkampf neu würfeln';
        detail=language==='en'?'Last deck slot. Neither your deck nor the current offers have a ranged unit.':'Letzter Deckplatz. Im Deck und im aktuellen Angebot fehlt Fernkampf.';
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
  loggedMatches=state.recentMatchResults??[];
  loggedTimings=state.history??[];
  loggedRecognitionIssues=state.recognitionIssues??[];
  renderActivityLog();
  renderTimingCharts(state.timingTrend??[]);
}
$('show-intermediates').onchange=()=>{
  rememberPreferences({showIntermediates:$('show-intermediates').checked});
  return action(()=>{});
};
await action(async()=>{
  const state=await fetchState().then(response=>response.json());
  lastTapSoundId=state.autoTapResult?.id??0;
  if(state.hasAudioClient||state.auto||state.capturing||state.recognizing)return;
  const selectedMode=state.modeSelection??state.mode;
  const mode=['auto','arena','draft','prep'].includes(preferences.mode)?preferences.mode:selectedMode;
  const settings={};
  if(state.gameLanguage!==language)settings.gameLanguage=language;
  if(mode!==selectedMode)settings.mode=mode;
  if(mode!=='prep'&&typeof preferences.autoTap==='boolean')settings.autoTap=preferences.autoTap;
  if(mode!=='prep'&&typeof preferences.continuum==='boolean')settings.continuum=preferences.continuum;
  if(Object.keys(settings).length)await post('/api/settings',{...settings,restoreBrowser:true});
});
let pollError;
async function pollState(){
  try{await refresh();pollError=null;}
  catch(e){
    for(const id of ['setup-connection','header-connection']){
      const connection=$(id);
      connection.textContent='Lokaler Server nicht erreichbar';
      connection.dataset.status='error';
      connection.removeAttribute('title');
    }
    $('capture').disabled=true;
    $('auto').disabled=true;
    canTapImage=false;
    screenshot.parentElement.classList.remove('direct-tap');
    speech?.cancel();
    if(e.message!==pollError)error(e);
    pollError=e.message;
  }
  finally{setTimeout(pollState,350);}
}
setTimeout(pollState,350);
window.addEventListener('beforeunload',()=>{stopMic();speech?.cancel();fetch('/api/browser/leave',{method:'POST',keepalive:true,headers:{...browserHeaders,'X-Coach-Token':config.token}}).catch(()=>{});});
