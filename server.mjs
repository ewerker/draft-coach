import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {appendFile,readFile,writeFile,readdir,unlink,mkdir,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {isIPv4} from 'node:net';
import readline from 'node:readline';
import {LatestQueue} from './pipeline.mjs';
import {allowedNames,observeChosenReinforcement,observeDraftLineup,observeOwnCardValues,recommend,suggestLineup} from './advice.mjs';
import {CARDS} from './data/coach-engine.mjs';
import {quickAdvice} from './quick-advice.mjs';
import {EN_CARD_NAMES} from './public/language.mjs';
import {createArchive} from './archive.mjs';
import {reviewReplay} from './review.mjs';
import {proposeReview} from './review-gpt.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url)), IMAGES=path.join(ROOT,'references'), RUNTIME=path.join(ROOT,'runtime');
const archiveFile=path.join(RUNTIME,'Draft-Coach.sqlite3');
const archive=createArchive(archiveFile,RUNTIME);
const PREPARATION=path.join(RUNTIME,'vorbereitung');
const preparationKinds=['units','spells','deck-units','deck-spells'];
const preparationPattern=/^(units|spells|deck-units|deck-spells)-(\d{13})-[a-f0-9]{8}\.png$/;
const PORT=Number(process.env.PORT||4317);
const lanAddress=process.env.COACH_LAN_ADDRESS;
if(lanAddress&&(!isIPv4(lanAddress)||lanAddress==='0.0.0.0'||lanAddress.startsWith('127.')))throw Error('Ungültige LAN-Adresse.');
const lanPasswordFile=path.join(RUNTIME,'lan-passwort.txt');
const ADB=process.env.ADB_PATH||'adb';
const PYTHON=process.env.PYTHON_PATH||(process.platform==='win32'?'python':'python3');
let device=process.env.ADB_DEVICE||'';
const token=randomBytes(24).toString('hex');
const collectionFile=path.join(RUNTIME,'sammlung-aktiv.json');
const tacticsFile=path.join(RUNTIME,'taktikregeln.json');
let tactics=JSON.parse(await readFile(existsSync(tacticsFile)?tacticsFile:path.join(ROOT,'data','tactic-seeds.json'),'utf8'));
let savingTactics=false;
const initialCollection=JSON.parse(await readFile(path.join(ROOT,'data','sample-collection.json'),'utf8'));
let collection=existsSync(collectionFile)?JSON.parse(await readFile(collectionFile,'utf8')):initialCollection;
let collectionDraft=null, importing=false;
let extendedPool=false;
let autoTap=false, tapGeneration=0, lastTappedChoice=null, tapMessage='';
let autoTapResult=null;
let lastCardTap=null;
let latestRelevant=null, manualTapPending=false;
let activeMatch=null, stoppedMatch=null;
const recentChoiceFrames=[];
const liveFrames=new Map();
function setAutoTap(enabled){
  if(autoTap===enabled&&enabled)return;
  autoTap=enabled;
  tapGeneration++;
  tapMessage='';
}
const db=JSON.parse(await readFile(path.join(ROOT,'data','matchups.json'),'utf8'));
const refs=[['einheiten-teil-1.png','Sammlung · Einheiten 1'],['einheiten-teil-2.png','Sammlung · Einheiten 2'],['einheiten-teil-3.png','Sammlung · Einheiten 3'],['zauber-teil-1.png','Sammlung · Zauber 1'],['zauber-teil-2.png','Sammlung · Zauber 2'],['schlacht-teil-1.png','Deckwahl · Beginn'],['schlacht-teil-2.png','Deckwahl · Gegner sichtbar'],['kampf-auswahl-1.png','Spielfeld · Einblendung'],['kampf-auswahl-2.png','Spielfeld · Figuren'],['kampf-spielstaerke-1.png','Kampf · Wahlangebote']].map(([file,title])=>({file,title})).filter(({file})=>existsSync(path.join(IMAGES,file)));
const state={ready:false,device,gameLanguage:'de',mode:process.env.COACH_MODE||'arena',auto:false,capturing:false,recognizing:false,latestId:0,current:null,error:null,history:[],references:refs,preparationKind:'units',preparation:[],connection:{status:'checking'},voiceNotice:'Browser-Spracherkennung kann einen externen Dienst verwenden. Aufnahme und Bilderkennung laufen lokal.'};
const captureLimit=900;
const playCaptureTimeout=6000;
const playTapDeadline=7000;
const capturePattern=/^capture-(\d+)\.png$/;
let serial=0,autoTimer=null,autoBusy=false,lastClientSeen=Date.now(),interruptibleCapture=null;
let audioClient=null;
function claimBrowser(client){
  if(!client)return;
  audioClient=client;
  lastClientSeen=Date.now();
}
await mkdir(PREPARATION,{recursive:true});
if(!existsSync(archiveFile)){
  const schema=await readFile(path.join(ROOT,'data','archive-schema.sql'),'utf8');
  const database=new DatabaseSync(archiveFile);
  try{database.exec('BEGIN IMMEDIATE;'+schema+'COMMIT;');}
  finally{database.close();}
}
let lanAuth;
if(lanAddress){
  const user=process.env.COACH_LAN_USER||'coach';
  let password=process.env.COACH_LAN_PASSWORD;
  if(!password){
    if(!existsSync(lanPasswordFile))await writeFile(lanPasswordFile,randomBytes(18).toString('base64url')+'\n',{flag:'wx'});
    password=(await readFile(lanPasswordFile,'utf8')).trim();
  }
  lanAuth=Buffer.from('Basic '+Buffer.from(user+':'+password).toString('base64'));
}
for(const file of await readdir(RUNTIME)){
  const match=capturePattern.exec(file);
  if(match)serial=Math.max(serial,Number(match[1]));
}
function preparationEntry(file) {
  const match=preparationPattern.exec(file);
  return match?{file,kind:match[1],timestamp:Number(match[2]),image:'/preparation/'+file}:null;
}
state.preparation=(await readdir(PREPARATION)).map(preparationEntry).filter(Boolean).sort((a,b)=>a.timestamp-b.timestamp);
const worker=spawn(PYTHON,[path.join(ROOT,'vision.py')],{cwd:ROOT,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8',DRAFT_COACH_ENGLISH_NAMES:JSON.stringify(EN_CARD_NAMES)}});
const waiting=new Map();
worker.stderr.on('data',d=>console.error('Bildverarbeitung:',d.toString().slice(0,1500)));
readline.createInterface({input:worker.stdout}).on('line',line=>{
  try { const msg=JSON.parse(line); if(msg.ready){state.ready=true;maybeProbeDevice();return;} const pending=waiting.get(msg.id); if(!pending)return; waiting.delete(msg.id); clearTimeout(pending.timer); msg.error?pending.reject(Error(msg.error)):pending.resolve(msg); }catch{ state.error='Ungültige Antwort der lokalen Erkennung'; }
});
function failWorker(e) {state.ready=false;state.error='Lokale Erkennung nicht verfügbar: '+e.message;for(const p of waiting.values()){clearTimeout(p.timer);p.reject(e);}waiting.clear();}
worker.on('error',failWorker);worker.on('exit',code=>failWorker(Error('Bildverarbeitung beendet ('+code+')')));
let learnedBanners=[];
function recognize(job) {
  return new Promise((resolve,reject)=>{
    if(!state.ready)return reject(Error('Bilderkennung ist noch nicht bereit.'));
    const timer=setTimeout(()=>{waiting.delete(job.id);reject(Error('Erkennung nach 15 Sekunden abgebrochen'));worker.kill();},15000);
    const preferred=extendedPool?[]:[...allowedNames(collection,state.mode)];
    waiting.set(job.id,{resolve,reject,timer});
    worker.stdin.write(JSON.stringify({id:job.id,path:job.path,preparation:job.preparation,geometryOnly:job.geometryOnly,bannerTemplate:job.bannerTemplate,reviewCrop:job.reviewCrop,language:job.gameLanguage,preferred,learnedBanners})+'\n');
  });
}
function preparationVersion() {
  return state.preparation.map(shot=>shot.file).join(',');
}

async function buildCollectionDraft() {
  if(importing)throw Error('Ein Sammlungsimport läuft bereits.');
  if(!state.preparation.length)throw Error('Nimm zuerst Sammlungs- oder Aufstellungsbilder auf.');
  const version=preparationVersion();
  const preparation=state.preparation.map(({file,kind})=>({file,kind,path:path.join(PREPARATION,file)}));
  importing=true;
  try {
    const {images}=await recognize({id:++serial,preparation});
    if(version!==preparationVersion())throw Error('Die Aufnahmen haben sich geändert. Bitte erneut auswerten.');
    const warnings=[];
    for(const item of images){
      if(!item.cards.length)warnings.push(item.file+': '+(item.error||'Keine Karten erkannt.'));
    }
    const groups={};
    for(const [kind,key,activeKey,expected] of [['units','units','active_lineup',4],['spells','spells','active_loadout',3]]){
      const deck=images.findLast(item=>item.kind==='deck-'+kind);
      const deckNames=[...new Set((deck?.cards||[]).map(card=>card.name))];
      const deckComplete=deckNames.length===expected;
      const chosen=deckComplete?deckNames:collection[kind][activeKey];
      if(deck&&!deckComplete)warnings.push('Aufstellung '+(kind==='units'?'Einheiten':'Zauber')+': '+deckNames.length+' von '+expected+' erkannt. Bisherige Auswahl prüfen.');
      const observations=images.filter(item=>item.kind===kind||item===deck).flatMap(item=>item.cards);
      const previous=new Map(collection[kind][key].map(card=>[card.name,card]));
      const known=new Set([...previous.keys(),...observations.map(card=>card.name)]);
      groups[kind]=[...known].map(name=>{
        const matches=observations.filter(card=>card.name===name);
        const values=[...new Set(matches.map(card=>card.bottom_badge).filter(value=>value!=null))];
        const last=matches.findLast(card=>card.bottom_badge!=null);
        return {name,level:last?.bottom_badge??previous.get(name)?.bottom_badge??null,seen:matches.length>0,levelRead:!!last,conflict:values.length>1,selected:chosen.includes(name),owned:true};
      });
    }
    collectionDraft={id:randomBytes(12).toString('hex'),version,groups,warnings};
    return {id:collectionDraft.id,groups,warnings};
  } finally {importing=false;}
}

async function saveCollectionDraft(data) {
  const draft=collectionDraft;
  if(importing||!draft||draft.id!==data.id||draft.version!==preparationVersion())
    throw Error('Bitte die aktuellen Aufnahmen erneut auswerten.');
  const updated=structuredClone(collection);
  updated.method='Geprüfter lokaler Sammlungsimport';
  for(const [kind,activeKey,maximum] of [['units','active_lineup',4],['spells','active_loadout',3]]){
    const rows=data.groups?.[kind];
    const known=new Map(draft.groups[kind].map(row=>[row.name,row]));
    if(!Array.isArray(rows)||rows.length!==known.size||new Set(rows.map(row=>row.name)).size!==rows.length||
       rows.some(row=>!known.has(row.name)||typeof row.owned!=='boolean'||typeof row.selected!=='boolean'||(row.selected&&!row.owned)||
         (row.level!==null&&(!Number.isInteger(row.level)||row.level<1||row.level>25))))
      throw Error('Ungültige Kartenliste oder Stärkewerte.');
    const selected=rows.filter(row=>row.selected).map(row=>row.name);
    if(selected.length>maximum)throw Error('Die Aufstellung enthält zu viele ausgewählte Karten.');
    const previous=new Map(collection[kind][kind].map(card=>[card.name,card]));
    updated[kind][kind]=rows.filter(row=>row.owned).map(row=>({
      ...previous.get(row.name),name:row.name,bottom_badge:row.level,...(kind==='spells'?{selected:row.selected}:{})
    }));
    updated[kind][activeKey]=selected;
    updated[kind].count=updated[kind][kind].length;
  }
  importing=true;
  const temporary=collectionFile+'.tmp';
  try {
    await writeFile(temporary,JSON.stringify(updated,null,2));
    if(draft.version!==preparationVersion())throw Error('Die Aufnahmen haben sich geändert. Bitte erneut auswerten.');
    await rename(temporary,collectionFile);
    collection=updated;
    collectionDraft=null;
    if(state.current&&!state.current.expired)state.current.advice=calculateAdvice(state.current);
    return {collection};
  } finally {importing=false;}
}
function withObservedEnemies(result,job){
  if(!job.matchId||job.matchId!==activeMatch?.id||job.target!==device)return result;
  // Remember card identity and strength, but only draw boxes from this frame.
  const enemy=new Map([...activeMatch.enemyDeck.values()].map(({box,...card})=>[card.name,card]));
  for(const card of result.enemy||[]){
    if(card.name&&activeMatch.enemyDeck.get(card.position)?.name===card.name)enemy.set(card.name,card);
  }
  for(const [name,event] of activeMatch.enemyEvents)enemy.set(name,event);
  if(result.enemyEvent)enemy.set(result.enemyEvent.name,result.enemyEvent);
  const observedDraftUnits=activeMatch.draftObservation?[...activeMatch.draftObservation.seen]:[];
  return {...result,enemy:[...enemy.values()],observedDraftUnits,ownDeckPicks:[...activeMatch.ownDeckPicks],enemyAdditions:Object.fromEntries(activeMatch.enemyAdditions),ownReinforcements:Object.fromEntries(activeMatch.ownReinforcements)};
}
function newDraftObservation(){
  return {seen:new Set(),windows:new Set(),counts:new Map(),confirmed:false};
}
async function updateOwnCardValues(match,result,target){
  if(importing)return;
  const previous=collection.units.units;
  const units=observeOwnCardValues(match.ownCardValues,result,previous);
  if(units.every((unit,index)=>unit===previous[index]))return;
  const updated={...collection,units:{...collection.units,units}};
  const temporary=collectionFile+'.values.tmp';
  importing=true;
  try{
    await writeFile(temporary,JSON.stringify(updated,null,2)+'\n');
    if(activeMatch!==match||device!==target)return;
    await rename(temporary,collectionFile);
    collection=updated;
    for(const [index,unit] of units.entries()){
      for(const field of ['bottom_badge','blue_star']){
        if(unit[field]===previous[index][field])continue;
        match.ownCardValues.delete(unit.name+' '+field);
        match.cardValueChanges.push({name:unit.name,field,from:previous[index][field]??null,to:unit[field]});
      }
    }
  }catch(error){
    console.error('Eigene Kartenwerte speichern:',error.message);
  }finally{
    await unlink(temporary).catch(()=>{});
    importing=false;
  }
}
async function updateDraftLineup(match,result){
  const tracker=match.draftObservation;
  if(!tracker||!result.deckEvidence||importing)return;
  const names=observeDraftLineup(tracker,result,new Set(collection.units.units.map(card=>card.name)));
  if(!names)return;
  const old=collection.units.active_lineup;
  if(old.length===names.length&&old.every(name=>names.includes(name))){
    tracker.confirmed=true;
    return;
  }
  const lineup=[...old.filter(name=>names.includes(name)),...names.filter(name=>!old.includes(name))];
  const updated={...collection,units:{...collection.units,active_lineup:lineup}};
  const temporary=collectionFile+'.draft.tmp';
  importing=true;
  try{
    await writeFile(temporary,JSON.stringify(updated,null,2));
    if(activeMatch!==match||match.draftObservation!==tracker)return;
    await rename(temporary,collectionFile);
    collection=updated;
    collectionDraft=null;
    tracker.confirmed=true;
    match.learnedLineup=lineup;
  }catch(error){
    console.error('Draft-Aufstellung speichern:',error.message);
  }finally{
    await unlink(temporary).catch(()=>{});
    importing=false;
  }
}
function calculateAdvice(result,preview=true){
  const advice=recommend(result,state.mode,collection,db,extendedPool,tactics);
  if(preview&&tactics.some(rule=>rule.status==='test')){
    const tested=recommend(result,state.mode,collection,db,extendedPool,tactics,true);
    if(tested.evaluated.some(card=>card.rules?.some(rule=>rule.status==='test'))){
      advice.trial={pick:tested.best??tested.provisional,evaluated:tested.evaluated};
    }
  }
  return advice;
}
function tacticCards(){
  return [...new Set([...CARDS,...collection.units.units,...collection.spells.spells].map(card=>card.name))]
    .sort((a,b)=>a.localeCompare(b,'de'));
}
function validateTactic(data){

  const previous=tactics.find(rule=>rule.id===data.id);
  if(data.id&&!previous)throw Error('Diese Taktikregel ist nicht mehr verfügbar.');
  const title=typeof data.title==='string'?data.title.trim():'';
  const reason=typeof data.reason==='string'?data.reason.trim():'';
  const {mode,phase,offer,enemy,weight,status,action=previous?.action??''}=data;
  const cards=tacticCards();
  if(!title||title.length>100||!reason||reason.length>1500||!['draft','arena','beide'].includes(mode)||
    !['alle','deck_choice','battle_choice','spell_choice'].includes(phase)||!['notiz','test','aktiv'].includes(status)||
    !['','add','upgrade','multiply','multiply_upgrade','spell'].includes(action)||
    (offer!==''&&!cards.includes(offer))||(enemy!==''&&!cards.includes(enemy))||
    !Number.isInteger(weight)||Math.abs(weight)>20||(status!=='notiz'&&(!offer||weight===0)))
    throw Error('Prüfe die Angaben. Eine Testregel oder aktive Regel braucht eine Angebotskarte und ein Gewicht ungleich null.');
  return {...previous,id:previous?.id??randomBytes(12).toString('hex'),title,reason,mode,phase,offer,enemy,weight,status,action};
}
async function saveTactic(data){
  if(savingTactics)throw Error('Bitte warte, bis die laufende Speicherung fertig ist.');
  const updated=validateTactic(data);
  const previous=tactics.find(rule=>rule.id===updated.id);
  const next=previous?tactics.map(rule=>rule===previous?updated:rule):[...tactics,updated];
  return persistTactics(next,previous?.status==='aktiv'||updated.status==='aktiv');
}
async function deleteTactic(id){
  if(savingTactics)throw Error('Bitte warte, bis die laufende Speicherung fertig ist.');
  const previous=tactics.find(rule=>rule.id===id);
  if(!previous)throw Error('Diese Taktikregel ist nicht mehr verfügbar.');
  return persistTactics(tactics.filter(rule=>rule!==previous),previous.status==='aktiv');
}
function tacticLibrary(){
  return {rules:tactics,cards:tacticCards(),baseCount:db.length};
}
async function persistTactics(next,affectsAdvice){
  savingTactics=true;
  try {
    const temp=tacticsFile+'.tmp';
    await writeFile(temp,JSON.stringify(next,null,2)+'\n');
    await rename(temp,tacticsFile);
    tactics=next;
    if(affectsAdvice)tapGeneration++;
    for(const item of new Set([state.current,latestRelevant])){
      if(item&&!item.expired&&(item.source==='reference'||Date.now()-item.started<=6000))item.advice=calculateAdvice(item);
    }
    return tacticLibrary();
  } finally {savingTactics=false;}
}
function record(job,result) {
  const match=activeMatch;
  if(job.matchId&&job.matchId===match?.id&&job.target===device&&match.pendingReinforcement){
    const next=choiceSignature(result,true);
    if(result.phase==='battle'||(next&&result.offers.every(offer=>offer.name&&offer.action!=='unknown')&&next!==match.pendingReinforcement.choice)){
      observeChosenReinforcement(match.ownReinforcements,match.pendingReinforcement.offer);
      match.pendingReinforcement=null;
    }
  }
  result=withObservedEnemies(result,job);
  const ageMs=Date.now()-job.started;
  const expired=job.source!=='reference' && ageMs>6000;
  const advice=expired?{best:null,withheld:true,warnings:['Antwortfrist von 6 Sekunden überschritten.'],evaluated:[]}:calculateAdvice(result);
  const item={...job,path:undefined,...result,ageMs,expired,advice};
  state.current=item;state.error=null;state.history.unshift({id:job.id,title:job.title,phase:result.phase,captureMs:job.captureMs,visionMs:result.visionMs,ageMs,expired});state.history=state.history.slice(0,20);
  const cardChoice=choiceSignature(item,true);
  if(job.source!=='reference'&&job.matchId&&job.matchId===match?.id&&
     (cardChoice||item.phase==='spell_choice')){
    const {phase,offers,enemy,own,ownDeckPicks,ownReinforcements,enemyAdditions,hearts,specialStep,advice}=item;
    match.reviewFrames.push({id:item.id,language:job.gameLanguage,phase,offers,enemy,own,ownDeckPicks,
      ownReinforcements,enemyAdditions,hearts,specialStep,advice});
  }
  if(job.source!=='reference'&&(cardChoice||item.phase==='spell_choice'))latestRelevant=item;
  if(job.source!=='reference'&&cardChoice){
    // A newer result can arrive between displaying a frame and receiving its click.
    recentChoiceFrames.unshift(item);
    if(recentChoiceFrames.length>8)recentChoiceFrames.pop();
  }
  if(job.source!=='reference'&&job.tapGeneration===tapGeneration){
    const openedSpell=activeMatch?.id===job.matchId&&Date.now()<(activeMatch?.spellOpenedUntil??0);
    const choice=choiceSignature(item,item.phase==='battle_choice'||openedSpell&&item.phase==='spell_choice');
    const recognizedChoice=cardChoice&&item.offers.every(offer=>offer.name&&offer.action!=='unknown');
    if((recognizedChoice&&lastTappedChoice!==cardChoice)||['battle','collection','spells'].includes(item.phase)){
      lastTappedChoice=null;
      if(lastCardTap)lastCardTap.choice=null;
    }
    if(choice&&(!lastTappedChoice||recognizedChoice))void tapRecommendation(job,item,choice);
  }
}
function choiceSignature(result,manual=false,verifyBadges=false){
  const phases=manual?['deck_choice','battle_choice','spell_choice']:['deck_choice','battle_choice'];
  if(!phases.includes(result.phase)||!result.offers.length||
     result.offers.some(offer=>!manual&&(!offer.name||offer.action==='unknown')))return null;
  return JSON.stringify([result.phase,result.offers.map(offer=>[
    offer.position,offer.name,offer.action,offer.quantity,verifyBadges||offer.action==='spell'?offer.orange?.value:null,verifyBadges?offer.blue?.value:null
  ])]);
}
function shouldOpenSpell(item,match){
  return state.auto&&match?.id===item.matchId&&!match.spellOpenedUntil&&item.phase==='battle_choice'&&item.spellButton&&
    collection.spells.active_loadout.length>0&&item.hearts?.own>0&&(item.hearts.own<item.hearts.enemy||!item.advice.best);
}
async function tapRecommendation(job,item,choice,selection=null){
  const openSpell=!selection&&shouldOpenSpell(item,activeMatch);
  const chooseSpell=!selection&&item.phase==='spell_choice'&&activeMatch?.id===job.matchId&&
    Date.now()<(activeMatch?.spellOpenedUntil??0)&&!activeMatch.spellChosen;
  if(!selection&&!openSpell&&item.offers.some(offer=>offer.experimentalLanguage))return;
  const battleAuto=!selection&&item.phase==='battle_choice';
  const checkTimeout=Math.max(3500,Math.min(6500,Math.ceil(job.captureMs*1.6)));
  const verificationDeadline=selection?.deadline??job.started+playTapDeadline;
  const isCurrent=()=>job.tapGeneration===tapGeneration&&job.target===device&&job.mode===state.mode&&
    Date.now()-lastClientSeen<10000&&(selection?Date.now()<selection.deadline:
      autoTap&&!manualTapPending&&job.id===state.latestId&&Date.now()<verificationDeadline);
  const best=openSpell?{index:-1,name:null}:selection?{index:selection.index,name:item.offers[selection.index]?.name}:
    chooseSpell?automaticSpell(item,item.advice):automaticPick(item,item.advice);
  if(!best||!isCurrent()||(!selection&&(item.expired||Date.now()-job.started>6000))||lastTappedChoice===choice||state.capturing)return;
  const offer=openSpell?{name:null,box:item.spellButton}:item.offers[best.index];
  if(offer?.name!==best.name||(!selection&&offer.poolHint)||offer.box?.length!==4)return;
  state.capturing=true;
  const checkPath=path.join(RUNTIME,'tap-check-'+job.id+'.png');
  let outcome='abgebrochen',reason='Wahlfenster hat sich geändert oder konnte nicht bestätigt werden',coordinates;
  try{
    if(!selection&&item.phase==='deck_choice'){
      await new Promise(resolve=>setTimeout(resolve,650));
      if(!isCurrent())return;
    }
    const remaining=verificationDeadline-Date.now();
    if(remaining<=0){reason='Zeitfenster für die Kartenauswahl abgelaufen';return;}
    const png=await execAdb(['-s',job.target,'exec-out','screencap','-p'],Math.min(checkTimeout,remaining));
    if(!isCurrent()){reason='Klickprüfung abgelaufen oder Automatik unterbrochen';return;}
    if(png.length<24||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
      reason='Das Kontrollbild war kein gültiges PNG';return;
    }
    await writeFile(checkPath,png);
    const checked=await recognize({id:++serial,path:checkPath,gameLanguage:job.gameLanguage});
    if(!isCurrent()){reason='Klickprüfung abgelaufen oder Automatik unterbrochen';return;}
    if(!selection&&!openSpell&&checked.offers.some(offer=>offer.experimentalLanguage))return;
    if(openSpell){
      if(!shouldOpenSpell({...checked,matchId:job.matchId,advice:calculateAdvice(withObservedEnemies(checked,job),false)},activeMatch))return;
    }else if(battleAuto){
      const fresh=checked.offers[best.index];
      if(checked.phase!==item.phase||!fresh||fresh.position!==offer.position||fresh.name!==offer.name||
         fresh.action!==offer.action||fresh.quantity!==offer.quantity)return;
    }else if(choiceSignature(checked,!!selection||chooseSpell,true)!==choiceSignature(item,!!selection||chooseSpell,true))return;
    const verified=openSpell?best:selection?{index:selection.index,name:checked.offers[selection.index]?.name}:
      automaticPick(checked,calculateAdvice(withObservedEnemies(checked,job),false),chooseSpell);
    const box=openSpell?checked.spellButton:checked.offers[best.index]?.box;
    if(verified?.index!==best.index||verified.name!==best.name||(!selection&&checked.offers[best.index]?.poolHint)||
       box?.length!==4||box.some(n=>!Number.isFinite(n)))return;
    const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
    const geometry=checked.geometry;
    if(!geometry||geometry.width!==width||geometry.height!==height||
       JSON.stringify(item.geometry)!==JSON.stringify(geometry))return;
    const [left,top,contentWidth,contentHeight]=geometry.content;
    const {referenceWidth,referenceHeight}=geometry;
    if(box[0]<0||box[1]<0||box[2]>referenceWidth||box[3]>referenceHeight||box[2]<=box[0]||box[3]<=box[1])return;
    const x=Math.round(left+(box[0]+box[2])*contentWidth/(2*referenceWidth));
    const y=Math.round(top+(box[1]+box[3])*contentHeight/(2*referenceHeight));
    const sendTime=verificationDeadline-Date.now();
    if(x<0||x>=width||y<0||y>=height||sendTime<=0||!isCurrent())return;
    coordinates=[x,y];
    await execAdb(['-s',job.target,'shell','input','tap',String(x),String(y)],Math.min(2500,sendTime));
    outcome='gesendet';reason=undefined;
    if(openSpell){
      if(activeMatch?.id===job.matchId)activeMatch.spellOpenedUntil=Date.now()+12000;
      if(job.tapGeneration===tapGeneration)tapMessage='Zauberauswahl geöffnet.';
      return true;
    }
    lastTappedChoice=choice;
    if(job.matchId&&activeMatch?.id===job.matchId&&job.target===device){
      if(item.phase==='battle_choice')activeMatch.pendingReinforcement={choice,offer};
      if(chooseSpell)activeMatch.spellChosen=true;
      if(item.phase==='deck_choice'&&offer.name)activeMatch.ownDeckPicks.add(offer.name);
    }
    lastCardTap={id:job.id,index:best.index,name:best.name,choice,matchId:job.matchId};
    if(job.tapGeneration===tapGeneration)tapMessage=selection?(best.name??'Position '+(offer.position+1))+' · Auswahl an das Handy gesendet.':(best.name??'Zauber')+' automatisch angetippt.';
    return true;
  }catch(error){
    outcome=coordinates?'fehler':'abgebrochen';reason=error.message;
    if(coordinates&&job.tapGeneration===tapGeneration){
      setAutoTap(false);
      tapMessage='Antippen fehlgeschlagen: '+error.message;
    }
    if(selection)throw error;
  }finally{
    await unlink(checkPath).catch(()=>{});
    state.capturing=false;
    if(!selection&&(job.tapGeneration===tapGeneration||outcome==='fehler')){
      autoTapResult={id:job.id,outcome};
    }
    const entry={zeit:new Date().toISOString(),art:selection?'manuell':'automatisch',modus:job.mode,
      aufnahme:job.id,karte:best.name,position:openSpell?undefined:best.index+1,aktion:openSpell?'zauber-oeffnen':chooseSpell?'zauber-waehlen':undefined,ergebnis:outcome,grund:reason,koordinaten:coordinates,
      gegner:item.enemy?.map(({name,action,quantity})=>({name,action,quantity})),
      bewertung:item.advice?.evaluated[best.index]};
    await appendFile(path.join(RUNTIME,'antippen.jsonl'),JSON.stringify(entry)+'\n').catch(error=>console.error('Antipp-Protokoll:',error.message));
  }
}
function automaticSpell(result,advice){
  const ranked=advice.evaluated.filter(card=>card.name&&Number.isFinite(card.score)&&
    collection.spells.active_loadout.includes(card.name)).sort((a,b)=>b.score-a.score||a.index-b.index);
  return ranked[0]??null;
}
function automaticPick(result,advice,chooseSpell=false){
  if(chooseSpell)return automaticSpell(result,advice);
  if(result.phase!=='battle_choice')return advice.best;
  const tip=advice.best??advice.fallback;
  if(!tip||!tip.name||advice.evaluated[tip.index]?.score==null)return null;
  const offer=result.offers[tip.index];
  if(offer.action==='add'&&!Number.isInteger(offer.quantity))return null;
  return tip;
}
const transportOf=serial=>serial.includes(':')||serial.includes('_adb-tls')?'wifi':'usb';
const deviceNames=new Map([['RZCXC0FWP9V','SM_A556B']]);
let deviceScan=null, lastDeviceScan=0;
async function scanDevices() {
  if(deviceScan)return deviceScan;
  deviceScan=(async()=>{
    try {
      const output=(await execAdb(['devices','-l'],5000)).toString();
      const devices=output.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!l.startsWith('List of devices')).map(line=>{
        const [serial,status,...rest]=line.split(/\s+/);
        return {serial,status,model:rest.find(x=>x.startsWith('model:'))?.slice(6)||'',transport:transportOf(serial)};
      }).filter(d=>d.status);
      for(const d of devices)if(d.model)deviceNames.set(d.serial,d.model);
      const selected=devices.find(d=>d.serial===device);
      state.connection={status:selected?.status||'missing',model:deviceNames.get(device)||'',transport:transportOf(device),serial:device,otherDevices:devices.filter(d=>d.status==='device'&&d.serial!==device).length,checkedAt:Date.now()};
      if(state.connection.status==='device')maybeProbeDevice();
      else state.deviceProbe=null;
      return devices;
    } catch(e) {
      state.deviceProbe=null;
      state.connection={status:'error',model:deviceNames.get(device)||'',transport:transportOf(device),serial:device,checkedAt:Date.now()};
      throw e;
    }
  })().finally(()=>{lastDeviceScan=Date.now();deviceScan=null;});
  return deviceScan;
}
function selectDevice(target) {
  if(target!==device){
    lastTappedChoice=null;
    if(lastCardTap)lastCardTap.choice=null;
    activeMatch?.enemyEvents.clear();
    activeMatch?.enemyAdditions.clear();
    activeMatch?.enemyAdditionTimes.clear();
    activeMatch?.ownDeckPicks.clear();
    activeMatch?.ownReinforcements.clear();
    if(activeMatch)activeMatch.pendingReinforcement=null;
    activeMatch?.enemyDeck.clear();
    if(activeMatch?.draftObservation)activeMatch.draftObservation=newDraftObservation();
  }
  device=target;state.device=device;
  state.deviceProbe=null;
  state.connection={status:'checking',serial:device,model:deviceNames.get(device)||'',transport:transportOf(device)};
  void scanDevices().catch(()=>{});
}
const queue=new LatestQueue(async job=>{
  state.recognizing=true;
  try {
    const result=await recognize(job);
    if(job.matchId&&job.matchId===activeMatch?.id&&job.target===device){
      const match=activeMatch;
      if(result.hearts){
        const last=activeMatch.heartTimeline.at(-1);
        const {own,enemy}=result.hearts;
        if(last?.own!==own||last?.enemy!==enemy){
          // Both modes keep their formations between rounds.
          match.heartTimeline.push({captureId:job.id,own,enemy});
        }
      }
      for(const card of result.enemy||[]){
        const previous=activeMatch.enemyDeck.get(card.position);
        if(card.name&&card.similarity>(previous?.similarity??0))activeMatch.enemyDeck.set(card.position,card);
      }
      if(result.enemyEvent){
        const {name,action,quantity}=result.enemyEvent;
        match.enemyEvents.set(name,{name,action,quantity});
        if(action==='add'&&Number.isInteger(quantity)&&quantity>0){
          const key=JSON.stringify([name,quantity]);
          const previous=match.enemyAdditionTimes.get(key);
          // A banner usually stays visible across several captures.
          if(previous===undefined||job.started-previous>4000){
            match.enemyAdditions.set(name,(match.enemyAdditions.get(name)??0)+quantity);
          }
          match.enemyAdditionTimes.set(key,job.started);
        }
      }
      await updateDraftLineup(match,result);
      if(activeMatch===match&&job.target===device)await updateOwnCardValues(match,result,job.target);
    }
    return result;
  } finally {state.recognizing=false;}
},record,(job,e)=>{state.error=e.message;});
function execAdb(args,timeout=12000,input=null,signal) {
  return new Promise((resolve,reject)=>{
    const child=spawn(ADB,args,{windowsHide:true,signal});let chunks=[],bytes=0,err='';
    if(input!==null)child.stdin.end(input+'\n');else child.stdin.end();
    const timer=setTimeout(()=>{
      child.kill();
      reject(Object.assign(Error('Gerät antwortet nicht rechtzeitig.'),{code:'ADB_TIMEOUT'}));
    },timeout);
    child.stdout.on('data',d=>{bytes+=d.length;if(bytes>24*1024*1024){child.kill();return;}chunks.push(d);});child.stderr.on('data',d=>err+=d.toString());
    child.on('error',e=>{
      if(signal?.aborted)return;
      clearTimeout(timer);reject(Error('ADB konnte nicht gestartet werden: '+e.message));
    });
    child.on('close',code=>{
      clearTimeout(timer);
      if(signal?.aborted)reject(signal.reason);
      else if(code===0&&bytes<=24*1024*1024)resolve(Buffer.concat(chunks));
      else reject(Error((err||'ADB-Abruf fehlgeschlagen.').slice(0,400)));
    });
  });
}
async function trimRuntime(){
  const captures=(await readdir(RUNTIME))
    .map(file=>({file,match:capturePattern.exec(file)}))
    .filter(entry=>entry.match)
    .sort((a,b)=>Number(b.match[1])-Number(a.match[1]));
  for(const {file} of captures.slice(captureLimit))await unlink(path.join(RUNTIME,file)).catch(()=>{});
}
async function capture({probe = false, scheduled = false, interruptible = scheduled} = {}) {
  if(state.capturing||manualTapPending)throw Error('Eine Aufnahme oder Kartenauswahl läuft bereits.');
  if(importing)throw Error('Bitte warte, bis der Sammlungsimport fertig ist.');
  const preparationKind=state.mode==='prep'?state.preparationKind:null;
  if(!probe&&!preparationKind&&!state.ready)throw Error('Die lokale Erkennung startet noch.');
  state.capturing=true;state.error=null;
  const controller=interruptible?new AbortController():null;
  if(controller)interruptibleCapture=controller;
  const id=++serial,started=Date.now(),target=device,mode=state.mode,gameLanguage=state.gameLanguage,armedGeneration=tapGeneration;
  let match, captureDone;
  if(!probe&&!preparationKind){
    activeMatch??={id:randomBytes(12).toString('hex'),mode,started,captureIds:[],enemyDeck:new Map(),enemyEvents:new Map(),enemyAdditions:new Map(),enemyAdditionTimes:new Map(),heartTimeline:[],
      draftObservation:mode==='draft'?newDraftObservation():null,ownCardValues:new Map(),cardValueChanges:[],reviewFrames:[],ownDeckPicks:new Set(),ownReinforcements:new Map(),pendingReinforcement:null,
      lineup:{units:[...collection.units.active_lineup],spells:[...collection.spells.active_loadout]}};
    match=activeMatch;
    captureDone=Promise.withResolvers();
    match.captureDone=captureDone.promise;
    if(!interruptible){
      state.latestId=id;
      queue.supersede(id);
    }
  }
  try {
    const timeout=probe||preparationKind?12000:playCaptureTimeout;
    const png=await execAdb(['-s',target,'exec-out','screencap','-p'],timeout,null,controller?.signal);
    if(controller?.signal.aborted)return;
    if(interruptibleCapture===controller)interruptibleCapture=null;
    if(png.length<24||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('ADB hat kein gültiges PNG-Bild geliefert.');
    if(probe){
      const captureMs=Date.now()-started;
      const file=path.join(RUNTIME,'probe-'+id+'.png');
      try{
        await writeFile(file,png,{flag:'wx'});
        const {geometry}=await recognize({id,path:file,geometryOnly:true});
        return {captureMs,width:png.readUInt32BE(16),height:png.readUInt32BE(20),geometry};
      }finally{await unlink(file).catch(()=>{});}
    }
    if(preparationKind){
      const file=preparationKind+'-'+Date.now()+'-'+randomBytes(4).toString('hex')+'.png';
      await writeFile(path.join(PREPARATION,file),png,{flag:'wx'});
      const entry=preparationEntry(file);state.preparation.push(entry);
      return {id,preparation:entry};
    }
    const file=`capture-${id}.png`,dest=path.join(RUNTIME,file);await writeFile(dest,png,{flag:'wx'});
    match.captureIds.push(id);
    const source=transportOf(target);
    const frame={target,width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
    liveFrames.set(id,frame);
    if(liveFrames.size>captureLimit)liveFrames.delete(liveFrames.keys().next().value);
    const job={id,started,source,target,mode,gameLanguage,matchId:match.id,frame,automatic:scheduled||state.auto,tapGeneration:armedGeneration,title:source==='wifi'?'WLAN-Aufnahme':'USB-Aufnahme',path:dest,image:'/capture/'+file,captureMs:Date.now()-started};
    // A scheduled request supersedes recognition only when its image is available.
    state.latestId=Math.max(state.latestId,id);
    queue.push(job);void trimRuntime().catch(error=>console.error('Aufnahmen aufräumen:',error.message));return {id};
  } catch(e){
    if(controller?.signal.aborted)return;
    if(e.code==='ADB_TIMEOUT'&&!probe&&!preparationKind)
      e.message='Spielaufnahme nach 6 Sekunden abgebrochen. Bei langsamem WLAN bitte USB verwenden.';
    void scanDevices().catch(()=>{});throw e;
  } finally {
    if(interruptibleCapture===controller)interruptibleCapture=null;
    state.capturing=false;
    captureDone?.resolve();
  }
}
function canProbeDevice(){
  return state.connection.status==='device'&&state.ready&&!state.auto&&!state.capturing&&
    !state.recognizing&&!manualTapPending&&!importing;
}
function maybeProbeDevice(){
  if(!state.deviceProbe&&canProbeDevice())void probeDevice().catch(()=>{});
}
async function probeDevice(){
  if(!canProbeDevice())throw Error('Für die Probeaufnahme muss das Gerät verbunden und der Coach frei sein.');
  const probe={status:'running'};
  state.deviceProbe=probe;
  try{
    const result=await capture({probe:true});
    if(state.deviceProbe===probe)state.deviceProbe={status:'done',...result};
    return result;
  }catch(error){
    if(state.deviceProbe===probe)state.deviceProbe={status:'error',error:error.message};
    throw error;
  }
}
function setAuto(on) {
  clearTimeout(autoTimer);
  autoTimer=null;
  state.auto=!!on;
  if(!on)return;
  let timeouts=0;
  const tick=async()=>{
    if(Date.now()-lastClientSeen>10000){setAuto(false);return;}
    // Give the recognized offer a chance to reserve ADB for tap verification
    // before the next scheduled screenshot starts.
    if(autoBusy||state.capturing||manualTapPending||(autoTap&&state.recognizing)){
      autoTimer=setTimeout(tick,100);
      return;
    }
    const timer=autoTimer;
    const started=Date.now();
    autoBusy=true;
    try{
      if(await capture({scheduled:true}))timeouts=0;
    }catch(e){
      state.error=e.message;
      timeouts=e.code==='ADB_TIMEOUT'?timeouts+1:0;
      if(timeouts>=2&&autoTimer===timer){
        setAuto(false);
        state.error='Automodus nach zwei zu langsamen Spielaufnahmen gestoppt. Bitte USB verwenden oder den Automodus neu starten.';
      }
    }
    finally{
      autoBusy=false;
      if(autoTimer===timer)autoTimer=setTimeout(tick,Math.max(0,1000-(Date.now()-started)));
    }
  };
  autoTimer=setTimeout(tick,0);
}
async function tapImage({id,u,v}){
  const result=[state.current,latestRelevant,...recentChoiceFrames].find(item=>item?.id===id);
  const frame=liveFrames.get(id)??result?.frame;
  if(!frame||frame.target!==device)throw Error('Bitte eine Aufnahme des aktuell verbundenen Handys verwenden.');
  if(![u,v].every(value=>Number.isFinite(value)&&value>=0&&value<1))throw Error('Klick liegt außerhalb des Bildes.');
  if(manualTapPending||importing)throw Error('Bitte warte, bis die laufende Aktion fertig ist.');
  const generation=tapGeneration;
  const mode=state.mode;
  const x=Math.floor(u*frame.width),y=Math.floor(v*frame.height);
  const geometry=result?.geometry;
  let index=-1;
  if(geometry){
    const [left,top,width,height]=geometry.content;
    const rx=(x-left)*geometry.referenceWidth/width;
    const ry=(y-top)*geometry.referenceHeight/height;
    index=result.offers.findIndex(({box})=>box&&rx>=box[0]&&rx<box[2]&&ry>=box[1]&&ry<box[3]);
  }
  manualTapPending=true;
  interruptibleCapture?.abort();
  const card=result?.offers[index];
  const entry={zeit:new Date().toISOString(),art:'direkt',modus:mode,aufnahme:id,ergebnis:'gesendet',koordinaten:[x,y],
    ...(card?{karte:card.name,position:card.position+1,aktion:card.action,anzahl:card.quantity}:{})};
  try {
    const deadline=Date.now()+3500;
    while(state.capturing&&Date.now()<deadline&&generation===tapGeneration)
      await new Promise(resolve=>setTimeout(resolve,60));
    if(state.capturing||generation!==tapGeneration||frame.target!==device)throw Error('Klick abgebrochen. Bitte erneut versuchen.');
    await execAdb(['-s',frame.target,'shell','input','tap',String(x),String(y)],2500);
    if(index>=0){
      const choice=choiceSignature(result,true);
      if(choice&&result===state.current){
        lastTappedChoice=choice;
        if(result.matchId&&activeMatch?.id===result.matchId){
          if(result.phase==='battle_choice')activeMatch.pendingReinforcement={choice,offer:card};
          if(result.phase==='deck_choice'&&card.name)activeMatch.ownDeckPicks.add(card.name);
        }
      }
      lastCardTap={id,index,name:card.name,choice:result===state.current?choice:null,matchId:result.matchId};
    }
  }catch(error){
    entry.ergebnis='abgebrochen';entry.grund=error.message;
    throw error;
  }finally{
    manualTapPending=false;
    void appendFile(path.join(RUNTIME,'antippen.jsonl'),JSON.stringify(entry)+'\n').catch(error=>console.error('Antipp-Protokoll:',error.message));
  }
  if(generation===tapGeneration&&!state.auto)void capture({interruptible:true}).catch(error=>{state.error=error.message;});
  return {ok:true};
}
function stopMatch(){
  lastTappedChoice=null;
  if(lastCardTap)lastCardTap.choice=null;
  setAuto(false);
  setAutoTap(false);
  if(activeMatch){
    stoppedMatch={...activeMatch,ended:Date.now()};
    activeMatch=null;
  }
  return {matchId:stoppedMatch?.id??null};
}
async function saveMatchOutcome({matchId,outcome}){
  if(!['gewonnen','verloren','abgebrochen'].includes(outcome))throw Error('Ungültiges Partieergebnis.');
  const match=stoppedMatch;
  if(!match||match.id!==matchId||match.saving)throw Error('Für diese Partie kann gerade kein Ergebnis gespeichert werden.');
  match.saving=true;
  try {
    await match.captureDone;
    const {id,mode,started,ended,captureIds,heartTimeline,lineup,learnedLineup,cardValueChanges,reviewFrames}=match;
    await appendFile(path.join(RUNTIME,'partien.jsonl'),JSON.stringify({id,mode,started,ended,captureIds,heartTimeline,lineup,learnedLineup,cardValueChanges,reviewFrames,outcome})+'\n');
    if(stoppedMatch===match)stoppedMatch=null;
    return {ok:true};
  } finally {match.saving=false;}
}
const gptReviewEnabled=!!(process.env.OPENAI_API_KEY&&process.env.COACH_REVIEW_MODEL);
let gptReviewBusy=false,gptReviewCalls=0;
async function reviewWithGpt(data){
  if(!gptReviewEnabled)throw Error('GPT-Analyse ist auf dem Host nicht eingerichtet.');
  if(gptReviewBusy||gptReviewCalls>=10)throw Error('Analyse läuft bereits oder das Limit von zehn Aufrufen pro Start ist erreicht.');
  gptReviewBusy=true;
  try{
    const {game,frame}=await reviewContext(data.matchId,data.capture,data.language);
    let image;
    if(data.includeImage===true){
      if(state.auto||state.capturing||queue.running||manualTapPending)throw Error('Für die Auswertung zuerst die Aufnahme stoppen.');
      const png=await archive.review.image(game,frame.id);
      if(!png)throw Error('Bild nicht mehr verfügbar.');
      const file=path.join(RUNTIME,'review-'+randomBytes(8).toString('hex')+'.png');
      try{
        await writeFile(file,png);
        image=(await recognize({id:++serial,path:file,reviewCrop:true,gameLanguage:frame.language})).image;
        if(!image)throw Error('Der Bildausschnitt konnte nicht erstellt werden.');
      }finally{await unlink(file).catch(()=>{});}
    }
    gptReviewCalls++;
    const {phase,offers,enemy,hearts,advice}=frame;
    const evidence={mode:game.mode,phase,capture:frame.id,offers:offers.map(({name,action,quantity})=>({name,action,quantity})),
      enemy:enemy?.map(({name,action,quantity})=>({name,action,quantity})),hearts,
      chosen:frame.clicks.find(click=>click.ergebnis==='gesendet')?.karte,
      tip:(advice?.best??advice?.fallback??advice?.provisional)?.name,
      playerObservation:typeof data.observation==='string'?data.observation.slice(0,1500):''};
    const draft=await proposeReview({key:process.env.OPENAI_API_KEY,model:process.env.COACH_REVIEW_MODEL,
      language:data.uiLanguage,evidence,image});
    if(typeof draft.observation!=='string'||typeof draft.uncertainty!=='string')throw Error('Ungültiger Analysevorschlag.');
    const observation=[draft.observation,draft.uncertainty].filter(Boolean).join(' ').slice(0,1500);
    let rule=null;
    if(draft.rule){
      try{
        rule=validateTactic({...draft.rule,title:draft.rule.title?.slice(0,100),reason:observation,
          mode:'beide',phase:['battle_choice','deck_choice','spell_choice'].includes(phase)?phase:'alle',status:'test'});
      }catch{ /* Keep the observation when the suggested rule fails validation. */ }
    }
    return {observation,rule};
  }finally{gptReviewBusy=false;}
}
async function reviewContext(matchId,capture,language){
  const game=await archive.review.match(matchId);
  if(!Number.isSafeInteger(capture)||!game.captureIds.includes(capture))throw Error('Aufnahme nicht gefunden.');
  let frame=game.frames.find(item=>item.id===capture)??{id:capture,clicks:[]};
  if(!frame.phase){
    if(state.auto||state.capturing||queue.running||manualTapPending)throw Error('Für die Auswertung zuerst die Aufnahme stoppen.');
    const png=await archive.review.image(game,capture);
    if(!png)throw Error('Dieses ältere Bild ist nicht mehr verfügbar.');
    const file=path.join(RUNTIME,'review-'+randomBytes(8).toString('hex')+'.png');
    try{
      await writeFile(file,png);
      const result=await recognize({id:++serial,path:file,gameLanguage:language==='en'?'en':'de'});
      const click=frame.clicks.find(entry=>entry.gegner?.length);
      frame={...result,id:capture,language:language==='en'?'en':'de',clicks:frame.clicks,enemy:click?.gegner??result.enemy};
    }finally{await unlink(file).catch(()=>{});}
  }
  return {game,frame};
}
async function saveBannerCorrection(data){
  if(state.auto||state.capturing||queue.running||manualTapPending)throw Error('Für die Auswertung zuerst die Aufnahme stoppen.');
  const {game,frame}=await reviewContext(data.matchId,data.capture,data.language);
  const {name,action,quantity}=data;
  if(!collection.units.units.some(card=>card.name===name)&&!CARDS.some(card=>card.kind==='unit'&&card.name===name))
    throw Error('Wähle eine bekannte Gegnerfigur.');
  if(!['add','multiply','upgrade'].includes(action)||action==='multiply'&&quantity!==2||
     action==='add'&&(!Number.isInteger(quantity)||quantity<1||quantity>30))
    throw Error('Prüfe die Aktion und ihre Anzahl.');
  const image=await archive.review.image(game,frame.id);
  if(!image)throw Error('Bild nicht mehr verfügbar.');
  const file=path.join(RUNTIME,'review-'+randomBytes(8).toString('hex')+'.png');
  try{
    await writeFile(file,image);
    const result=await recognize({id:++serial,path:file,bannerTemplate:true,gameLanguage:frame.language});
    if(!result.rows)throw Error('Auf diesem Bild ist keine lesbare rote Gegneranzeige vorhanden.');
    await archive.review.save(game,frame,[name,action,action==='upgrade'?'':quantity].filter(Boolean).join(' · '),null,
      {name,action,quantity:action==='upgrade'?null:quantity,language:frame.language,rows:result.rows});
    learnedBanners=await archive.review.templates();
    return archive.review.list();
  }finally{await unlink(file).catch(()=>{});}
}
async function handleReview(data,operation){
  const {game,frame}=await reviewContext(data.matchId,data.capture,data.language);
  const observation=typeof data.observation==='string'?data.observation.trim().slice(0,1500):'';
  const rule=data.rule?validateTactic({...data.rule,id:undefined,status:'test'}):null;
  const replay=reviewReplay(frame,game.mode,collection,db,tactics,rule);
  if(operation==='frame')return {frame,replay};
  if(operation==='save'){
    let preferred=null;
    if(data.preferredOffer!=null){
      const index=data.preferredOffer;
      if(!Number.isInteger(index)||!frame.offers[index])throw Error('Angebot nicht gefunden.');
      const {name,action,quantity}=frame.offers[index];
      preferred={index,name,action,quantity};
    }
    if(!observation&&!rule&&!preferred)throw Error('Trage eine Beobachtung, Regel oder bevorzugte Wahl ein.');
    return {id:await archive.review.save(game,frame,observation,rule,null,preferred),replay};
  }
  const comparisons=[];
  let checked=0;
  if(rule){
    const games=(await archive.review.matches()).slice(0,15);
    for(const entry of games){
      for(const candidate of entry.reviewFrames??[]){
        if(entry.id===game.id&&candidate.id===frame.id)continue;
        if(rule.phase!=='alle'&&candidate.phase!==rule.phase||rule.mode!=='beide'&&entry.mode!==rule.mode||
           !candidate.offers.some(offer=>offer.name===rule.offer)||rule.enemy&&!candidate.enemy?.some(card=>card.name===rule.enemy))continue;
        if(++checked>120)return {replay,comparisons};
        const result=reviewReplay(candidate,entry.mode,collection,db,tactics,rule);
        if(result.before?.name!==result.after?.name||result.before?.action!==result.after?.action){
          comparisons.push({matchId:entry.id,capture:candidate.id,...result});
          if(comparisons.length>=12)return {replay,comparisons};
        }
      }
    }
  }
  return {replay,comparisons};
}
async function updateReviewRule({id,status}){
  if(!['test','aktiv','zurueck'].includes(status))throw Error('Ungültiger Regelstatus.');
  const item=(await archive.review.list()).find(item=>item.id===id);
  if(!item?.rule)throw Error('Zu diesem Fall ist keine Regel gespeichert.');
  const ruleId=item.revision?.ruleId;
  const previous=tactics.find(rule=>rule.id===ruleId);
  if(status==='zurueck'){
    if(previous)await deleteTactic(previous.id);
    await archive.review.revise(id,{status,ruleId:previous?.id??ruleId,rule:previous??item.rule});
  }else{
    const result=await saveTactic({...item.rule,id:previous?.id,status});
    const rule=result.rules.find(rule=>rule.id===previous?.id)??result.rules.at(-1);
    await archive.review.revise(id,{status,ruleId:rule.id,rule});
  }
  return archive.review.list();
}
function json(res,status,obj) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
async function body(req) {let text='';for await(const chunk of req){text+=chunk;if(text.length>12000)throw Error('Anfrage zu groß');}return text?JSON.parse(text):{};}
async function handleRequest(req,res){
  try {
    if(req.socket.localAddress===lanAddress){
      if(req.headers.host!==lanAddress+':'+PORT)return json(res,403,{error:'Unzulässiger Host'});
      const credentials=Buffer.from(req.headers.authorization??'');
      if(credentials.length!==lanAuth.length||!timingSafeEqual(credentials,lanAuth)){
        res.setHeader('WWW-Authenticate','Basic realm="Draft Coach"');
        return json(res,401,{error:'Anmeldung erforderlich'});
      }
    }else if(!['127.0.0.1:'+PORT,'localhost:'+PORT].includes(req.headers.host))return json(res,403,{error:'Unzulässiger Host'});
    const url=new URL(req.url,'http://127.0.0.1:'+PORT);
    const localAdmin=req.socket.localAddress==='127.0.0.1';
    if(url.pathname.startsWith('/api/admin/')&&!localAdmin)return json(res,403,{error:'Archivverwaltung nur am Host-PC.'});
    const client=/^[a-f0-9]{32}$/.test(req.headers['x-coach-client']??'')?req.headers['x-coach-client']:null;
    if(req.method==='POST') {
      if(req.headers['x-coach-token']!==token)return json(res,403,{error:'Anfrage nicht freigegeben'});
      const data=await body(req);
      if(url.pathname==='/api/desktop/stop'&&req.socket.localAddress==='127.0.0.1'){
        setAuto(false);
        setAutoTap(false);
        if(state.capturing||queue.running||manualTapPending||importing||savingTactics||stoppedMatch?.saving||archive.busy)
          return json(res,409,{error:'Coach schließt den laufenden Vorgang ab.'});
        res.once('finish',()=>{shutdown();process.exit();});
        return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/taktikregeln')return json(res,200,await saveTactic(data));
      if(url.pathname==='/api/admin/review/gpt')return json(res,200,await reviewWithGpt(data));
      if(url.pathname==='/api/admin/review/frame')return json(res,200,await handleReview(data,'frame'));
      if(url.pathname==='/api/admin/review/preview')return json(res,200,await handleReview(data,'preview'));
      if(url.pathname==='/api/admin/review/banner')return json(res,200,await saveBannerCorrection(data));
      if(url.pathname==='/api/admin/review/template'){
        await archive.review.toggleTemplate(data.id,data.enabled);
        learnedBanners=await archive.review.templates();
        return json(res,200,await archive.review.list());
      }
      if(url.pathname==='/api/admin/review/save')return json(res,200,await handleReview(data,'save'));
      if(url.pathname==='/api/admin/review/rule')return json(res,200,await updateReviewRule(data));
      if(url.pathname==='/api/admin/archiv/uebernehmen'){
        if(state.auto||state.capturing||queue.running)throw Error('Für den Archivimport zuerst die Aufnahme stoppen.');
        return json(res,200,await archive.archiveGames());
      }
      if(url.pathname==='/api/taktikregeln/loeschen')return json(res,200,await deleteTactic(data.id));
      if(url.pathname==='/api/schnellauskunft'){
        if(typeof data.question!=='string'||!data.question.trim()||data.question.length>500)
          throw Error('Die Frage muss zwischen 1 und 500 Zeichen lang sein.');
        const context=Array.isArray(data.context)?data.context.slice(0,3):[];
        return json(res,200,quickAdvice(data.question,tacticCards(),tactics,db,context,data.language));
      }
      if(url.pathname==='/api/browser/audio'){claimBrowser(client);return json(res,200,{ok:true});}
      if(url.pathname==='/api/browser/leave'){
        if(client&&client===audioClient){
          audioClient=null;
          setAuto(false);
          setAutoTap(false);
        }
        return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/capture'){
        claimBrowser(client);
        return json(res,202,await capture());
      }
      if(url.pathname==='/api/probe')return json(res,200,await probeDevice());
      if(url.pathname==='/api/partie/stopp')return json(res,200,stopMatch());
      if(url.pathname==='/api/partie/ergebnis')return json(res,200,await saveMatchOutcome(data));
      if(url.pathname==='/api/tap-image')return json(res,200,await tapImage(data));
      if(url.pathname==='/api/tap-test'){
        const item=[state.current,latestRelevant,...recentChoiceFrames].find(result=>result?.id===data.id);
        const index=data.index;
        if(!item||item.target!==device||item.mode!==state.mode||item.reviewed||
           !Number.isInteger(index)||index<0||index>=item.offers.length)
          throw Error('Bitte ein aktuelles Wahlfenster am Handy aufnehmen.');
        if(manualTapPending)throw Error('Eine Kartenauswahl läuft bereits.');
        const choice=choiceSignature(item,true);
        if(!choice)throw Error('Die Wahlposition konnte nicht erkannt werden.');
        const job={...item,tapGeneration};
        manualTapPending=true;
        interruptibleCapture?.abort();
        try {
          const verificationDeadline=Date.now()+playTapDeadline;
          const deadline=Date.now()+3500;
          while((state.capturing||state.recognizing)&&Date.now()<deadline&&job.tapGeneration===tapGeneration)
            await new Promise(resolve=>setTimeout(resolve,60));
          if(lastTappedChoice===choice)throw Error('Für dieses Wahlfenster wurde bereits eine Wahl ans Handy gesendet.');
          const sent=await tapRecommendation(job,item,choice,{index,deadline:verificationDeadline});
          if(!sent)throw Error('Die aktuelle Wahl ließ sich nicht bestätigen. Bitte neu aufnehmen und erneut versuchen.');
          return json(res,200,{ok:true,message:tapMessage});
        } finally {manualTapPending=false;}
      }
      if(url.pathname==='/api/preparation/import')return json(res,200,await buildCollectionDraft());
      if(url.pathname==='/api/preparation/apply')return json(res,200,await saveCollectionDraft(data));
      if(url.pathname==='/api/preparation/remove') {
        if(importing)throw Error('Bitte warte, bis der Sammlungsimport fertig ist.');
        const {file}=data;
        if(typeof file!=='string'||!preparationPattern.test(file)||!state.preparation.some(shot=>shot.file===file))
          return json(res,404,{error:'Sammlungsaufnahme nicht gefunden.'});
        await unlink(path.join(PREPARATION,file)).catch(error=>{
          if(error.code!=='ENOENT')throw error;
        });
        state.preparation=state.preparation.filter(shot=>shot.file!==file);
        return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/reference') {
        const ref=refs.find(r=>r.file===data.file);if(!ref)return json(res,404,{error:'Referenz fehlt'});
        const id=++serial;state.latestId=id;queue.push({id,started:Date.now(),source:'reference',title:ref.title,path:path.join(IMAGES,ref.file),image:'/reference/'+ref.file,captureMs:0});return json(res,202,{id});
      }
      if(url.pathname==='/api/settings') {
        if(data.gameLanguage!==undefined){
          if(!['de','en'].includes(data.gameLanguage))throw Error('Ungültige Spielsprache.');
          if(state.gameLanguage!==data.gameLanguage){
            setAutoTap(false);
            state.gameLanguage=data.gameLanguage;
          }
        }
        if(data.restoreBrowser&&audioClient&&client!==audioClient)return json(res,200,{ok:true});
        if(data.mode!==undefined){
          if(!['draft','arena','prep'].includes(data.mode))throw Error('Ungültiger Modus');
          if(state.capturing)throw Error('Aufnahme zuerst abwarten.');
          if(state.mode!==data.mode){setAutoTap(false);activeMatch=null;stoppedMatch=null;}
          state.mode=data.mode;
          if(state.mode==='prep')setAuto(false);
        }
        if(data.autoTap!==undefined){
          if(typeof data.autoTap!=='boolean'||(data.autoTap&&state.mode==='prep'))throw Error('Automatischer Klick ist nur in Draft und Schlacht verfügbar.');
          if(data.autoTap&&!data.restoreBrowser)claimBrowser(client);
          setAutoTap(data.autoTap);
        }
        if(data.extendedPool!==undefined){
          if(typeof data.extendedPool!=='boolean')throw Error('Ungültige Einstellung für Sonderangebote.');
          extendedPool=data.extendedPool;
        }
        if((data.mode!==undefined||data.extendedPool!==undefined)&&state.mode!=='prep'&&state.current&&!state.current.expired)
          state.current.advice=calculateAdvice(state.current);
        if(data.preparationKind!==undefined){if(!preparationKinds.includes(data.preparationKind))throw Error('Ungültige Aufnahmeart.');if(state.capturing)throw Error('Aufnahme zuerst abwarten.');state.preparationKind=data.preparationKind;}
        if(data.device!==undefined){if(!/^[a-zA-Z0-9._:-]{1,180}$/.test(data.device))throw Error('Ungültige Geräteadresse.');if(state.capturing||state.auto)throw Error('Aufnahme und Automatik zuerst stoppen');if(device!==data.device)setAutoTap(false);selectDevice(data.device);}
        if(data.auto!==undefined){
          if(data.auto&&state.mode!=='prep')claimBrowser(client);
          setAuto(state.mode!=='prep'&&data.auto);
        }
        return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/connect'){const message=(await execAdb(['connect',device])).toString().trim();await scanDevices().catch(()=>{});return json(res,200,{message});}
      if(url.pathname==='/api/pair') {
        if(!/^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/.test(data.address)||!/^\d{6}$/.test(data.code))throw Error('Pairing-Adresse mit Port und sechsstelligen Code eingeben.');
        const message=(await execAdb(['pair',data.address],12000,data.code)).toString().trim();return json(res,200,{message});
      }
      if(url.pathname==='/api/enable-wifi') {
        if(state.capturing||state.auto)throw Error('Aufnahme und Automatik zuerst stoppen');
        if(device.includes(':'))throw Error('Zuerst ein per USB verbundenes Gerät auswählen.');
        if(data.confirm!==true)throw Error('Aktivierung benötigt eine ausdrückliche Auswahl.');
        const routes=(await execAdb(['-s',device,'shell','ip','route'])).toString();
        const line=routes.split('\n').find(l=>l.includes('wlan')&&l.includes(' src '));
        const ip=line?.match(/\bsrc\s+([0-9.]+)/)?.[1];if(!ip)throw Error('Das Handy hat keine erkennbare WLAN-Adresse.');
        await execAdb(['-s',device,'tcpip','5555']);
        const address=ip+':5555';let message='';
        for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,500));message=(await execAdb(['connect',address])).toString().trim();if(/connected to/.test(message))break;}
        selectDevice(address);return json(res,200,{message,address});
      }
      if(url.pathname==='/api/usb-only') {
        if(state.capturing||state.auto)throw Error('Aufnahme und Automatik zuerst stoppen');
        const message=(await execAdb(['-s',device,'usb'])).toString().trim();
        return json(res,200,{message:'ADB auf USB zurückgestellt. USB-Kabel anschließen und Geräte neu suchen. '+message});
      }
      if(url.pathname==='/api/review') {
        if(!state.current||data.id!==state.current.id)throw Error('Diese Aufnahme ist nicht mehr aktuell.');
        if(!Array.isArray(data.offers)||data.offers.length>4)throw Error('Ungültige Angebote');
        const known=new Set([...collection.units.units,...collection.spells.spells].map(c=>c.name));
        for(const o of data.offers){if(o.name&&!known.has(o.name))throw Error('Unbekannte Karte');if(!['add','multiply','upgrade','multiply_upgrade','unknown'].includes(o.action))throw Error('Ungültige Aktion');}
        state.current.offers=data.offers;state.current.reviewed=true;state.current.advice=state.current.expired?state.current.advice:calculateAdvice(state.current);return json(res,200,{ok:true});
      }
      return json(res,404,{error:'Nicht gefunden'});
    }
    if(req.method!=='GET')return json(res,405,{error:'Nicht unterstützt'});
    if(url.pathname==='/api/state'){
      if(!audioClient||client===audioClient)lastClientSeen=Date.now();
      if(Date.now()-lastDeviceScan>3000)void scanDevices().catch(()=>{});
      if(state.current&&state.current.source!=='reference'&&Date.now()-state.current.started>6000)state.current.expired=true;
      const relevant=latestRelevant?.target===device&&latestRelevant.mode===state.mode?latestRelevant:null;
      const relevantView=relevant&&Date.now()-relevant.started>6000?
        {...relevant,expired:true}:relevant;
      const enemyEvents=activeMatch?[...activeMatch.enemyEvents.values()]:[];
      const hearts=(activeMatch??stoppedMatch)?.heartTimeline.at(-1)??null;
      const activeLineup=collection.units.active_lineup;
      const observedDraftUnits=[...(activeMatch?.draftObservation?.seen??[])].filter(name=>!activeLineup.includes(name));
      const showSent=item=>{
        if(!item||!lastCardTap)return item;
        const sameChoice=lastCardTap.choice&&item.matchId&&item.matchId===lastCardTap.matchId&&
          choiceSignature(item,true)===lastCardTap.choice;
        return item.id===lastCardTap.id||sameChoice?{...item,sentChoice:{index:lastCardTap.index,name:lastCardTap.name}}:item;
      };
      return json(res,200,{...state,current:showSent(state.current),latestRelevant:showSent(relevantView),enemyEvents,hearts,activeLineup,observedDraftUnits,extendedPool,autoTap,tapMessage,autoTapResult,lastCardTap,manualTapPending,hasAudioClient:!!audioClient,audioHere:!!client&&client===audioClient});
    }
    if(url.pathname==='/api/devices') {
      const devices=await scanDevices();
      return json(res,200,{devices,selected:device});
    }
    if(url.pathname==='/api/admin/review/matches'){
      const games=await archive.review.matches();
      return json(res,200,{games:games.slice(0,50).map(({id,mode,outcome,ended})=>({id,mode,outcome,ended})),cards:tacticCards(),gpt:gptReviewEnabled});
    }
    if(url.pathname==='/api/admin/review/match'){
      const {id,mode,outcome,captureIds,frames}=await archive.review.match(url.searchParams.get('id'));
      return json(res,200,{id,mode,outcome,captureIds,frames:frames.map(({id,phase,language,advice,clicks})=>({id,phase,language,
        tip:(advice?.best??advice?.fallback??advice?.provisional)?.name,clicked:clicks.find(click=>click.ergebnis==='gesendet')?.karte}))});
    }
    if(url.pathname==='/api/admin/review/cases')return json(res,200,await archive.review.list());
    if(url.pathname==='/api/admin/review/image'){
      const game=await archive.review.match(url.searchParams.get('id'));
      const image=await archive.review.image(game,Number(url.searchParams.get('capture')));
      if(!image)return json(res,404,{error:'Bild nicht mehr verfügbar.'});
      res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      return res.end(image);
    }
    if(req.method==='GET'&&url.pathname==='/api/admin/archiv')return json(res,200,await archive.status());
    if(req.method==='GET'&&url.pathname==='/api/admin/archiv/sicherung'){
      await archive.sendBackup(res);
      return;
    }
    if(url.pathname==='/api/preparation/recommendation')return json(res,200,suggestLineup(collection));
    if(url.pathname==='/api/config')return json(res,200,{token,collection,desktopControl:true,localAdmin});
    if(url.pathname==='/api/taktikregeln')return json(res,200,tacticLibrary());
    let file;
    if(url.pathname.startsWith('/reference/')){const name=url.pathname.slice(11);if(refs.some(r=>r.file===name))file=path.join(IMAGES,name);}
    else if(url.pathname.startsWith('/capture/')){const name=url.pathname.slice(9);if(/^capture-\d+\.png$/.test(name))file=path.join(RUNTIME,name);}
    else if(url.pathname.startsWith('/preparation/')){const name=url.pathname.slice(13);if(preparationPattern.test(name))file=path.join(PREPARATION,name);}
    else file=({'/':'index.html','/app.js':'app.js','/style.css':'style.css','/language.mjs':'language.mjs'})[url.pathname] && path.join(ROOT,'public',({'/':'index.html','/app.js':'app.js','/style.css':'style.css','/language.mjs':'language.mjs'})[url.pathname]);
    if(!file||!existsSync(file))return json(res,404,{error:'Nicht gefunden'});
    const ext=path.extname(file),type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'}[ext];
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(await readFile(file));
  }catch(e){if(res.headersSent)res.destroy();else json(res,400,{error:e.message});}
}
await archive.initializeReview();
learnedBanners=await archive.review.templates();
const server=http.createServer(handleRequest);
server.listen(PORT,'127.0.0.1',()=>console.log('Draft Coach: http://127.0.0.1:'+PORT));
const lanServer=lanAddress?http.createServer(handleRequest):null;
lanServer?.on('error',error=>console.error('LAN-Zugriff:',error.message));
lanServer?.listen(PORT,lanAddress,()=>console.log('Draft Coach LAN: http://'+lanAddress+':'+PORT));
function shutdown(){setAuto(false);worker.kill();server.close();lanServer?.close();}
process.on('SIGINT',()=>{shutdown();process.exit();});process.on('SIGTERM',()=>{shutdown();process.exit();});
