import {displayNames} from './language.mjs';
const messages={de:{title:'Gezielte Bildfragen',intro:'Hilf der Truppenerkennung mit wenigen Bestätigungen. Pro Runde höchstens drei Bilder; weitere bleiben in der Liste.',
 open:'offen',answered:'beantwortet',start:'Bis zu drei Bilder prüfen',suggest:'Neue Bildfragen zusammenstellen',all:'Alle Bildfragen',none:'Keine offenen Bildfragen. Neue Fragen entstehen nach abgeschlossenen Partien oder über den Button.',
 own:'Eigene Truppen · unten',enemy:'Gegnerische Truppen · oben',yes:'Stimmt',partial:'Teilweise',no:'Stimmt nicht',unassessable:'Nicht beurteilbar',
 blind:'Unabhängiges Kontrollbild: Die Vermutung des Coaches bleibt verborgen. Bitte beschreibe nur, was du selbst siehst.',proposal:'Vorschlag des Coaches – noch nicht bestätigt',
 unit:'Figur',count:'Gesamtzahl dieser Figur auf dieser Seite',unknown:'Unbekannt / verdeckt',typeConfirm:'Diesen Figurentyp bestätigen',countConfirm:'Diese Gesamtzahl bestätigen',
 add:'Figur ergänzen',remove:'Entfernen',complete:'Alle sichtbaren Figurentypen dieser Seite erfasst',empty:'Auf dieser Seite sind eindeutig keine Truppen',
 form:'Sichtbare Ausbauform beschreiben',formConfirm:'Diese Form bestätigen',formCount:'Anzahl dieser Form (optional)',addForm:'Weitere Form',
 box:'Ein gut sichtbares Exemplar markieren',marking:'Ziehe auf dem Bild einen Rahmen um EINE Figur dieses Typs. Nicht um die gesamte Gruppe.',boxDone:'Exemplar markiert',
 boxHint:'Typ und Zahl lassen sich ohne Rahmen prüfen. Ein Rahmen um ein einzelnes Exemplar wird zusätzlich zur Lernvorlage. Überlappende oder verdeckte Zahlen offen lassen.',
 skip:'Ohne Änderung zurück',save:'Bestätigungen speichern und weiter',saved:'Gespeichert. Die Erkennungsprüfung ist vorgemerkt.',done:'Diese Prüfrunde ist abgeschlossen.',progress:'Bild',of:'von',
 note:'„Stimmt“ bestätigt nur die angezeigten Figurentypen. Anzahl und Ausbau werden ausschließlich mit den eigenen Bestätigungen übernommen. Ohne Antwort bleibt die Seite offen.',
 draft:'Entwurf auf diesem Browser gespeichert. Erst „Bestätigungen speichern“ übernimmt die Angaben.',pending:'Übernahme zur Erkennungsprüfung wartet auf eine Spielpause.',exported:'Bestätigungen übernommen.',
 failed:'Übernahme fehlgeschlagen',retry:'Erneut versuchen',edit:'Öffnen / ändern',evaluation:'Erkennungsprüfung',running:'läuft',waiting:'wartet auf genügend Lern- und unabhängige Testdaten',ready:'aktuell',stale:'vorgemerkt',
 formHint:'Beschreibe die sichtbare Form, z. B. Hut mit Stern. Keine allgemeine Nummerierung von Ausbaustufen voraussetzen. Formbezeichnungen werden gespeichert; ihre automatische Zuordnung folgt im nächsten Ausbauschritt.',
 idle:'Das Spiel darf weiterlaufen; die aufwendige Erkennungsprüfung wartet bis zum Stopp.',confirm:'Bitte Figurentypen und alle tatsächlich bekannten Zahlen ausdrücklich bestätigen.',
 full:'Ganzes Bild öffnen',training:'Lernbestand',test:'Unabhängiger Testbestand',emptyProposal:'Keine verlässliche Vermutung vorhanden. Das bedeutet nicht, dass die Seite leer ist.',sidePending:'Noch keine Antwort zu dieser Seite',clear:'Antwort offenlassen',
 errors:{IMAGE_REVIEW_BUSY:'Bitte nach der Partie die Aufnahme stoppen und erneut versuchen.',IMAGE_QUESTION_CHANGED:'Die Frage wurde inzwischen geändert. Bitte neu öffnen.',CONFIRM_UNIT_TYPE:'Bitte bestätige jeden eingetragenen Figurentyp oder entferne ihn.',CONFIRM_EMPTY_FIELD:'Bitte bestätige ausdrücklich, dass die Seite leer ist, oder lasse sie unvollständig.',INVALID_UNIT_COUNT:'Bitte eine ganze Anzahl zwischen 1 und 1000 eingeben oder unbekannt lassen.',INVALID_UNIT_FORM:'Bitte die Form beschreiben und bestätigen. Formzahlen dürfen die Gesamtzahl nicht überschreiten.',INVALID_EXAMPLE_BOX:'Bitte ein einzelnes Exemplar innerhalb der gewählten Spielfeldhälfte markieren.',DUPLICATE_UNIT_TYPE:'Jede Figur einmal eintragen; verschiedene Formen innerhalb der Figur ergänzen.',INVALID_IMAGE_ANSWER:'Bitte mindestens eine Seite beantworten und deine Angaben prüfen.'}},
en:{title:'Targeted image questions',intro:'Help army recognition with a few confirmations. Each round contains up to three images; other questions remain in the list.',open:'open',answered:'answered',start:'Review up to three images',suggest:'Collect new image questions',all:'All image questions',none:'No open image questions. New questions are collected after completed matches or with the button.',
 own:'Your units · lower area',enemy:'Enemy units · upper area',yes:'Correct',partial:'Partly correct',no:'Incorrect',unassessable:'Cannot assess',blind:'Independent control image: the coach’s guess is hidden. Describe only what you can see yourself.',proposal:'Coach’s proposal – not confirmed yet',
 unit:'Unit',count:'Total of this unit on this side',unknown:'Unknown / obscured',typeConfirm:'Confirm this unit type',countConfirm:'Confirm this total',add:'Add a unit',remove:'Remove',complete:'All visible unit types on this side are covered',empty:'There are clearly no units on this side',
 form:'Describe the visible evolution form',formConfirm:'Confirm this form',formCount:'Count of this form (optional)',addForm:'Another form',box:'Mark one clearly visible example',marking:'Drag a box around ONE unit of this type. Do not mark the entire group.',boxDone:'Example marked',boxHint:'Types and counts can be reviewed without boxes. A box around one example also supplies a training crop. Leave obscured or overlapping counts unknown.',skip:'Back without changes',save:'Save confirmations and continue',saved:'Saved. Recognition evaluation has been queued.',done:'This review round is complete.',progress:'Image',of:'of',note:'“Correct” confirms only the displayed unit types. Counts and evolution forms require their own confirmations. A side without an answer remains open.',draft:'Draft saved in this browser. Only “Save confirmations” submits your answers.',pending:'Transfer to recognition evaluation waits until capture stops.',exported:'Confirmations transferred.',failed:'Transfer failed',retry:'Retry',edit:'Open / edit',evaluation:'Recognition evaluation',running:'running',waiting:'waiting for enough training data and independent test data',ready:'up to date',stale:'queued',formHint:'Describe the visible appearance, e.g. hat with a star. Do not assume a universal evolution numbering scheme. Form descriptions are stored; automatic form matching is a later work package.',idle:'You may keep playing; recognition evaluation waits until capture stops.',confirm:'Explicitly confirm unit types and any counts you know.',full:'Open full image',training:'Training partition',test:'Independent test partition',emptyProposal:'No reliable guess available. This does not mean the side is empty.',sidePending:'No answer for this side yet',clear:'Leave this side unanswered',
 errors:{IMAGE_REVIEW_BUSY:'Stop capture after the match, then try again.',IMAGE_QUESTION_CHANGED:'This question has changed. Please open it again.',CONFIRM_UNIT_TYPE:'Confirm each unit type or remove it.',CONFIRM_EMPTY_FIELD:'Confirm that the side is empty, or leave its coverage incomplete.',INVALID_UNIT_COUNT:'Enter a whole count from 1 to 1000 or leave it unknown.',INVALID_UNIT_FORM:'Describe and confirm the form. Form counts must not exceed the total.',INVALID_EXAMPLE_BOX:'Mark a single unit inside the selected battlefield area.',DUPLICATE_UNIT_TYPE:'Enter each unit once; add its different forms within that unit.',INVALID_IMAGE_ANSWER:'Answer at least one side and check the entries.'}}};
export function createImageReviewPanel({root,getLanguage,post}){
 let data={items:[],counts:{}},item=null,answer=null,round=[],position=0,notice='',mark=null,zoom='full';
 const t=()=>messages[getLanguage()==='en'?'en':'de'];
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,cls='small')=>{const n=el('button',text,cls);n.type='button';n.onclick=()=>run(fn);return n;};
 const read=async url=>{const response=await fetch(url);const value=await response.json();if(!response.ok)throw Error(value.error??'Request failed');return value;};
 const key=()=>`coach-image-answer-${item?.id}-${item?.revision}`;
 function remember(){try{localStorage.setItem(key(),JSON.stringify(answer));}catch{}}
 async function run(fn){try{notice='';await fn();}catch(e){notice=t().errors[e.message]??e.message;}render();}
 async function refresh(){data=await read('/api/image-review');render();}
 async function open(id){item=await read('/api/image-review/item?id='+encodeURIComponent(id));mark=null;zoom='full';
  answer=structuredClone(item.answer??{sides:{}});
  // Proposals prefill names only. Counts and forms are never silently trusted.
  if(!item.answer)for(const side of ['enemy','own'])answer.sides[side]={verdict:null,groups:(item.context.proposals?.[side]?.groups??[]).map(g=>({name:g.name,typeConfirmed:false,count:null,countConfirmed:false,forms:[],box:null})),typesComplete:false,emptyConfirmed:false};
  try{const draft=JSON.parse(localStorage.getItem(key()));if(draft?.sides)answer=draft;}catch{}
  render();root.scrollIntoView({block:'start',behavior:'smooth'});
 }
 function input(label,value,onchange,type='text'){
  const l=el('label',label),n=el('input');n.type=type;n.value=value??'';if(type==='number'){n.min='1';n.max='1000';n.step='1';}
  n.oninput=()=>{onchange(type==='number'?(n.value===''?null:Number(n.value)):n.value);remember();};l.append(n);return l;
 }
 function check(label,value,onchange){const l=el('label',null,'image-review-check'),n=el('input');n.type='checkbox';n.checked=!!value;n.onchange=()=>{onchange(n.checked);remember();};l.append(n,document.createTextNode(label));return l;}
 function sideEditor(side){
  const s=answer.sides[side]??={verdict:null,groups:[],typesComplete:false,emptyConfirmed:false};
  const area=el('section',null,'image-review-side');area.append(el('h4',t()[side]));
  const actions=el('div',null,'image-review-verdicts');
  for(const verdict of ['yes','partial','no','unassessable']){
   const b=button(t()[verdict],()=>{
    s.verdict=verdict;
    if(verdict==='unassessable'){s.groups=[];s.typesComplete=false;s.emptyConfirmed=false;}
    else if(verdict==='yes')for(const g of s.groups)g.typeConfirmed=true;
    remember();
   });b.setAttribute('aria-pressed',String(s.verdict===verdict));actions.append(b);
  }
  actions.append(button(t().clear,()=>{s.verdict=null;s.typesComplete=false;s.emptyConfirmed=false;for(const g of s.groups){g.typeConfirmed=false;g.countConfirmed=false;}remember();}));area.append(actions);
  if(s.verdict==='unassessable')return area;
  if(!s.verdict)area.append(el('p',t().sidePending,'muted'));
  if(!s.groups.length)area.append(el('p',t().emptyProposal,'muted'));
  for(const [index,g] of s.groups.entries()){
   const row=el('div',null,'image-review-unit'),name=el('select');name.setAttribute('aria-label',t().unit);
   name.append(new Option('—',''),...item.cards.map(n=>new Option(displayNames(n,getLanguage()),n)));name.value=g.name;
   name.onchange=()=>{g.name=name.value;g.typeConfirmed=false;remember();render();};
   const heading=el('div',null,'image-review-unit-head');heading.append(name,button(t().remove,()=>{s.groups.splice(index,1);remember();}));row.append(heading);
   row.append(check(t().typeConfirm,g.typeConfirmed,v=>g.typeConfirmed=v));
   row.append(input(t().count,g.count,v=>{g.count=v;g.countConfirmed=false;row.querySelector('[data-count-confirm]').checked=false;},'number'));
   const c=check(t().countConfirm,g.countConfirmed,v=>g.countConfirmed=v);c.firstChild.dataset.countConfirm='';row.append(c);
   for(const [fi,f] of (g.forms??[]).entries()){
    const form=el('div',null,'image-review-form');form.append(input(t().form,f.label,v=>{f.label=v;f.confirmed=false;form.querySelector('input[type=checkbox]').checked=false;}),check(t().formConfirm,f.confirmed,v=>f.confirmed=v),input(t().formCount,f.count,v=>{f.count=v;f.countConfirmed=false;form.querySelectorAll('input[type=checkbox]')[1].checked=false;},'number'),check(t().countConfirm,f.countConfirmed,v=>f.countConfirmed=v),button(t().remove,()=>{g.forms.splice(fi,1);remember();}));row.append(form);
   }
   row.append(button(t().addForm,()=>{g.forms??=[];g.forms.push({label:'',confirmed:false,count:null,countConfirmed:false});remember();}));
   row.append(button(g.box?t().boxDone:t().box,()=>{mark={side,index};zoom=side;notice=t().marking;root.querySelector('canvas')?.scrollIntoView({block:'center',behavior:'smooth'});}));
   if(g.box)row.append(button('×',()=>{g.box=null;remember();}));area.append(row);
  }
  area.append(button(t().add,()=>{if(s.groups.length>=64)return;s.groups.push({name:'',typeConfirmed:false,count:null,countConfirmed:false,forms:[],box:null});if(!s.verdict)s.verdict='partial';remember();}));
  area.append(check(t().complete,s.typesComplete,v=>s.typesComplete=v),check(t().empty,s.emptyConfirmed,v=>{s.emptyConfirmed=v;if(v)s.typesComplete=true;}));return area;
 }
 function canvasImage(parent){
  const viewY=zoom==='enemy'?325:zoom==='own'?1580:0,viewHeight=zoom==='enemy'?690:zoom==='own'?510:2340;
  const switches=el('div',null,'image-review-actions');
  for(const [value,label] of [['full',getLanguage()==='en'?'Full image':'Ganzes Bild'],['enemy',t().enemy],['own',t().own]])switches.append(button(label,()=>{zoom=value;}));parent.append(switches);
  const canvas=el('canvas');canvas.width=1080;canvas.height=viewHeight;canvas.className='image-review-canvas';canvas.tabIndex=0;canvas.style.touchAction=mark?'none':'auto';canvas.setAttribute('aria-label',t().marking);
  const ctx=canvas.getContext('2d'),image=new Image();
  const draw=()=>{ctx.clearRect(0,0,1080,viewHeight);const c=item.context.geometry?.content??[0,0,image.naturalWidth,image.naturalHeight];ctx.drawImage(image,c[0],c[1]+viewY/2340*c[3],c[2],viewHeight/2340*c[3],0,0,1080,viewHeight);
   for(const side of ['enemy','own']){const y=side==='enemy'?325:1580,h=side==='enemy'?690:510;ctx.lineWidth=5;ctx.strokeStyle=side==='enemy'?'#ff7171':'#75ecaf';ctx.setLineDash([18,10]);ctx.strokeRect(8,y-viewY,1064,h);
    for(const [i,g] of (answer.sides[side]?.groups??[]).entries())if(g.box){ctx.setLineDash([]);ctx.lineWidth=8;ctx.strokeStyle=mark?.side===side&&mark.index===i?'#fff':'#ffe675';ctx.strokeRect(g.box[0],g.box[1]-viewY,g.box[2]-g.box[0],g.box[3]-g.box[1]);ctx.font='bold 30px sans-serif';ctx.fillStyle='#111';ctx.fillRect(g.box[0],g.box[1]-viewY-38,45,38);ctx.fillStyle='#fff';ctx.fillText(String(i+1),g.box[0]+8,g.box[1]-viewY-8);}}
  };
  image.onload=draw;image.src='/api/image-review/image?id='+item.id;let start=null;
  const point=e=>{const r=canvas.getBoundingClientRect();return [Math.round((e.clientX-r.left)/r.width*1080),viewY+Math.round((e.clientY-r.top)/r.height*viewHeight)];};
  canvas.onpointerdown=e=>{if(!mark)return;start=point(e);canvas.setPointerCapture(e.pointerId);e.preventDefault();};
  canvas.onpointerup=e=>{if(!mark||!start)return;const end=point(e),box=[Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.max(start[0],end[0]),Math.max(start[1],end[1])];start=null;
   const min=mark.side==='enemy'?325:1580,max=mark.side==='enemy'?1015:2090;
   if(box[1]<min||box[3]>max||box[2]-box[0]<12||box[3]-box[1]<12||box[2]-box[0]>450||box[3]-box[1]>450){notice=t().errors.INVALID_EXAMPLE_BOX;render();return;}
   answer.sides[mark.side].groups[mark.index].box=box;mark=null;notice=t().boxDone;remember();render();
  };canvas.onpointercancel=()=>start=null;
  parent.append(canvas);const link=el('a',t().full);link.href=image.src;link.target='_blank';link.rel='noopener';parent.append(link);if(mark)parent.append(el('p',t().marking,'image-review-message'));
 }
 function render(){
  root.dataset.reviewOriginal='';root.replaceChildren();root.append(el('h3',t().title),el('p',t().intro,'muted'));
  root.append(el('p',`${data.counts.open??0} ${t().open} · ${data.counts.answered??0} ${t().answered}`));
  const bar=el('div',null,'image-review-actions');bar.append(button(t().start,async()=>{round=data.items.filter(q=>!q.answered).slice().sort((a,b)=>a.created-b.created).slice(0,3).map(q=>q.id);position=0;if(round.length)await open(round[0]);}),button(t().suggest,async()=>{await post('/api/image-review/suggest');await refresh();}));root.append(bar);
  const message=el('p',notice,'image-review-message');message.setAttribute('role','status');root.append(message);
  if(!data.items.length)root.append(el('p',t().none,'muted'));
  if(item){
   root.append(el('h4',`${t().progress} ${position+1} ${t().of} ${Math.max(round.length,1)} · #${item.match_id.slice(0,8)} / ${item.capture_id}`));
   root.append(el('p',`${t()[item.partition==='test'?'test':'training']} · ${item.context.language?.toUpperCase()} · ${({de:{battle_choice:'Wahl im Kampf',spell_choice:'Zauberwahl'},en:{battle_choice:'Battle choice',spell_choice:'Spell choice'}})[getLanguage()]?.[item.context.phase]??item.context.phase}`,'muted'));
   root.append(el('p',item.blind?t().blind:t().proposal,'image-review-message'),el('p',t().note,'muted'));
   const layout=el('div',null,'image-review-layout'),picture=el('div',null,'image-review-picture'),editors=el('div');canvasImage(picture);editors.append(sideEditor('enemy'),sideEditor('own'),el('p',t().boxHint,'muted'),el('p',t().formHint,'muted'),el('p',t().draft,'muted'));layout.append(picture,editors);root.append(layout);
   const submit=button(t().save,async()=>{
    const confirmed={language:getLanguage(),sides:{}};
    for(const side of ['own','enemy']){const s=answer.sides[side];if(s?.verdict)confirmed.sides[side]=s;}
    await post('/api/image-review/answer',{id:item.id,revision:item.revision,answer:confirmed});
    try{localStorage.removeItem(key());}catch{}
    item=null;answer=null;notice=t().saved;await refresh();
    if(++position<round.length)await open(round[position]);else notice=t().done+' '+t().saved;
   },'primary');editors.append(submit,button(t().skip,()=>{item=null;answer=null;mark=null;}));
   const e=item.evaluation;editors.append(el('p',`${t().evaluation}: ${e?.running?t().running:e?.error?e.error:!e?.eligibleCases||!e?.inventory?.trainingMatches?t().waiting:e.pending?t().stale:t().ready}. ${t().idle}`,'muted'));
  }
  const list=el('details',null,'image-review-list');list.append(el('summary',`${t().all} (${data.items.length})`));
  for(const q of data.items){const row=el('div',null,'image-review-list-row');row.append(el('span',`${new Date(q.created).toLocaleString(getLanguage()==='en'?'en-GB':'de-DE')} · #${q.match_id.slice(0,8)} · ${q.capture_id} · ${q.answered?t().answered:t().open}`),button(t().edit,async()=>{round=[q.id];position=0;await open(q.id);}));
   if(q.export_status==='pending')row.append(el('small',t().pending));
   if(q.export_status==='done')row.append(el('small',t().exported));
   if(q.export_status==='failed')row.append(el('small',t().failed+': '+q.export_error),button(t().retry,async()=>{await post('/api/image-review/retry',{id:q.id});await refresh();}));list.append(row);}
  root.append(list);
 }
 return {refresh,render};
}
