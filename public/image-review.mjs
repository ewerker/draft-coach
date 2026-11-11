import {displayNames} from './language.mjs';

// Suggestions are editable drafts, never confirmations. Even an exact model
// count needs a player's separate confirmation before entering the truth set.
export function imageQuestionDraft(item,language='de'){
 const result=structuredClone(item.answer??{sides:{}}),valid=new Set(item.cards??[]);
 for(const side of ['enemy','own']){
  const saved=result.sides[side];
  if(saved){
   if((saved.actor??item.answer?.actor)==='codex'){
    saved.actor='codex';
    saved.verdict=null;
    saved.typesComplete=false;
    saved.emptyConfirmed=false;
    for(const group of saved.groups){
     group.typeConfirmed=false;
     group.countConfirmed=false;
     group.proposalSource='codex';
     for(const form of group.forms??[]){form.confirmed=false;form.countConfirmed=false;}
    }
   }
   continue;
  }
  const seen=new Set(),groups=[];
  for(const g of item.context?.proposals?.[side]?.groups??[]){
   if(!valid.has(g.name)||seen.has(g.name))continue;seen.add(g.name);
   const raw=g.count??g.proposedCount??g.visibleMinimum;
   const count=Number.isInteger(raw)&&raw>0&&raw<=1000?raw:null;
   const forms=(g.forms??[]).slice(0,32).flatMap(f=>{
    const label=f.labels?.[language]??f.label;if(typeof label!=='string'||!label.trim()||label.length>100)return [];
    return [{label,confirmed:false,count:Number.isInteger(f.count)&&f.count>0&&f.count<=1000?f.count:null,countConfirmed:false}];
   });
   groups.push({name:g.name,typeConfirmed:false,count,countConfirmed:false,forms,box:null,
    proposalSource:g.proposalSource??'recognition',countIsMinimum:g.count==null&&g.proposedCount==null&&g.visibleMaximum!==g.visibleMinimum&&count!==null});
  }
  result.sides[side]={verdict:null,groups,typesComplete:false,emptyConfirmed:false};
 }
 return result;
}

const fieldKey=(side,index,field,formIndex='')=>[side,index??'',field,formIndex].join(':');
// Only required confirmations block saving. An unconfirmed optional number is
// deliberately left unknown rather than turning an estimate into ground truth.
export function imageAnswerIssues(answer,cards){
 const issues=[],names=new Set(cards),validCount=n=>Number.isInteger(n)&&n>=1&&n<=1000;
 const add=(side,index,field,code,formIndex)=>issues.push({side,index,field,code,formIndex,key:fieldKey(side,index,field,formIndex)});
 let answered=0;
 for(const side of ['enemy','own']){
  const s=answer?.sides?.[side];if(!s)continue;
  if(!s.verdict){if(s.actor!=='codex'&&s.groups?.some(g=>g.typeConfirmed||g.box||g.count!=null||g.forms?.length))add(side,null,'verdict','sideAnswer');continue;}
  answered++;
  if(!['yes','partial','no','unassessable'].includes(s.verdict)){add(side,null,'verdict','sideAnswer');continue;}
  if(s.verdict==='unassessable')continue;
  const seen=new Set();
  for(const [index,g] of (s.groups??[]).entries()){
   if(!names.has(g.name))add(side,index,'name','chooseUnit');
   else if(seen.has(g.name))add(side,index,'name','duplicateUnit');
   seen.add(g.name);
   if(g.typeConfirmed!==true)add(side,index,'type','confirmType');
   if(g.countConfirmed===true&&!validCount(g.count))add(side,index,'count','validCount');
   for(const [fi,f] of (g.forms??[]).entries()){
    if(!f.label?.trim()||f.label.length>100)add(side,index,'formLabel','describeForm',fi);
    if(f.confirmed!==true)add(side,index,'formConfirm','confirmForm',fi);
    if(f.countConfirmed===true&&!validCount(f.count))add(side,index,'formCount','validCount',fi);
   }
   if(g.countConfirmed===true&&(g.forms??[]).reduce((sum,f)=>sum+(f.countConfirmed===true&&validCount(f.count)?f.count:0),0)>g.count)add(side,index,'count','formTotal');
   if(g.box&&(!Array.isArray(g.box)||g.box.length!==4||g.box.some(n=>!Number.isFinite(n))||g.box[0]<0||g.box[1]<(side==='enemy'?325:1580)||g.box[2]>1080||g.box[3]>(side==='enemy'?1015:2090)||g.box[2]-g.box[0]<12||g.box[3]-g.box[1]<12||g.box[2]-g.box[0]>450||g.box[3]-g.box[1]>450))add(side,index,'box','exampleBox');
  }
  if(s.typesComplete===true&&!s.groups?.length&&s.emptyConfirmed!==true)add(side,null,'empty','confirmEmpty');
 }
 if(!answered&&!issues.length)add('enemy',null,'verdict','sideAnswer');
 return issues;
}
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
 let validationAttempted=false,issues=[],focusIssue=null,noticeIsError=false;
 const controls=new Map();
 const validationCopy=()=>getLanguage()==='en'?{
  title:'Please check before saving',confirmType:'Tick “Confirm this unit type” for this unit.',chooseUnit:'Choose a unit type or remove this row.',duplicateUnit:'This unit is already listed. Add different forms within the same unit.',validCount:'Enter a whole count from 1 to 1000, or leave the count unconfirmed.',describeForm:'Describe the visible form (up to 100 characters) or remove it.',confirmForm:'Tick “Confirm this form” or remove the form.',formTotal:'Confirmed form counts exceed the confirmed total. Check the counts.',exampleBox:'Mark one example inside the selected battlefield area.',confirmEmpty:'Confirm that this side is empty, or untick complete coverage.',sideAnswer:'Choose Correct, Partly correct, Incorrect or Cannot assess for this side.',missing:'Missing unit confirmation. Tick the box before saving.'
 }:{title:'Bitte vor dem Speichern prüfen',confirmType:'Setze bei dieser Figur das Häkchen „Diesen Figurentyp bestätigen“.',chooseUnit:'Wähle eine Figur oder entferne diese Zeile.',duplicateUnit:'Diese Figur ist bereits eingetragen. Weitere Formen gehören in dieselbe Figur.',validCount:'Gib eine ganze Anzahl von 1 bis 1000 ein oder lasse die Anzahl unbestätigt.',describeForm:'Beschreibe die sichtbare Form mit höchstens 100 Zeichen oder entferne sie.',confirmForm:'Setze das Häkchen „Diese Form bestätigen“ oder entferne die Form.',formTotal:'Die bestätigten Formzahlen sind größer als die bestätigte Gesamtzahl. Bitte prüfe die Zahlen.',exampleBox:'Markiere ein einzelnes Exemplar innerhalb der gewählten Spielfeldhälfte.',confirmEmpty:'Bestätige die leere Seite oder entferne das Häkchen für vollständige Erfassung.',sideAnswer:'Wähle für diese Seite „Stimmt“, „Teilweise“, „Stimmt nicht“ oder „Nicht beurteilbar“.',missing:'Figurentyp noch nicht bestätigt. Bitte vor dem Speichern das Häkchen setzen.'};
 const t=()=>messages[getLanguage()==='en'?'en':'de'];
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,cls='small')=>{const n=el('button',text,cls);n.type='button';n.onclick=()=>run(fn);return n;};
 const read=async url=>{const response=await fetch(url);const value=await response.json();if(!response.ok)throw Error(value.error??'Request failed');return value;};
 const key=()=>`coach-image-answer-${item?.id}-${item?.revision}`;
 function remember(){try{localStorage.setItem(key(),JSON.stringify(answer));}catch{}}
 async function run(fn){try{notice='';noticeIsError=false;await fn();}catch(e){notice=t().errors[e.message]??e.message;noticeIsError=true;focusIssue='summary';}render();}
 async function refresh(){data=await read('/api/image-review');render();}
 async function open(id){item=await read('/api/image-review/item?id='+encodeURIComponent(id));mark=null;zoom='full';validationAttempted=false;issues=[];focusIssue=null;
  answer=imageQuestionDraft(item,getLanguage());
  try{const draft=JSON.parse(localStorage.getItem(key()));if(draft?.sides)answer=draft;}catch{}
  render();root.scrollIntoView({block:'start',behavior:'smooth'});
 }
 function issueText(issue){const name=answer?.sides?.[issue.side]?.groups?.[issue.index]?.name;return `${t()[issue.side]}${name?' · '+displayNames(name,getLanguage()):''}: ${validationCopy()[issue.code]}`;}
 function attachField(container,control,key){
  const error=el('p',null,'image-review-field-error');error.id='image-review-error-'+key.replaceAll(':','-');error.hidden=true;
  container.append(error);controls.set(key,{container,control,error});return container;
 }
 function feedback(){const box=el('div',null,'image-review-feedback');box.tabIndex=-1;box.setAttribute('role','alert');return box;}
 function paintValidation(){
  for(const [key,binding] of controls){const issue=issues.find(i=>i.key===key);binding.error.textContent=issue?validationCopy()[issue.code]:'';binding.error.hidden=!issue;binding.container.classList.toggle('image-review-invalid',!!issue);binding.control.setAttribute('aria-invalid',String(!!issue));if(issue)binding.control.setAttribute('aria-describedby',binding.error.id);else binding.control.removeAttribute('aria-describedby');}
  for(const box of root.querySelectorAll('.image-review-feedback')){
   box.replaceChildren();box.hidden=!issues.length&&!noticeIsError;
   if(issues.length){box.append(el('strong',validationCopy().title));const list=el('ul');for(const issue of issues)list.append(el('li',issueText(issue)));box.append(list);}
   else if(noticeIsError)box.append(el('p',notice));
  }
 }
 function updateValidation(){if(validationAttempted){issues=imageAnswerIssues(answer,item?.cards??[]);paintValidation();}}
 function input(label,value,onchange,type='text',key=null){
  const l=el('label',label),n=el('input');n.type=type;n.value=value??'';if(type==='number'){n.min='1';n.max='1000';n.step='1';}
  n.oninput=()=>{onchange(type==='number'?(n.value===''?null:Number(n.value)):n.value);remember();updateValidation();};l.append(n);return key?attachField(l,n,key):l;
 }
 function check(label,value,onchange,key=null){const l=el('label',null,'image-review-check'),n=el('input');n.type='checkbox';n.checked=!!value;n.onchange=()=>{onchange(n.checked);remember();if(key?.split(':')[2]==='type'){const hint=n.closest('.image-review-unit')?.querySelector('.image-review-required-hint');if(hint)hint.hidden=n.checked;}updateValidation();};l.append(n,document.createTextNode(label));if(!key)return l;const wrap=el('div',null,'image-review-check-field');wrap.append(l);return attachField(wrap,n,key);}
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
  actions.append(button(t().clear,()=>{s.verdict=null;s.typesComplete=false;s.emptyConfirmed=false;for(const g of s.groups){g.typeConfirmed=false;g.countConfirmed=false;}remember();}));area.append(attachField(actions,actions.querySelector('button'),fieldKey(side,null,'verdict')));
  if(s.verdict==='unassessable')return area;
  if(!s.verdict)area.append(el('p',t().sidePending,'muted'));
  if(!s.groups.length)area.append(el('p',t().emptyProposal,'muted'));
  for(const [index,g] of s.groups.entries()){
   const row=el('div',null,'image-review-unit'),name=el('select');name.setAttribute('aria-label',t().unit);
   const key=(field,fi)=>fieldKey(side,index,field,fi);
   name.append(new Option('—',''),...item.cards.map(n=>new Option(displayNames(n,getLanguage()),n)));name.value=g.name;
   name.onchange=()=>{g.name=name.value;g.typeConfirmed=false;remember();render();};
   const heading=el('div',null,'image-review-unit-head');heading.append(name,button(t().remove,()=>{s.groups.splice(index,1);remember();}));row.append(heading);
   attachField(heading,name,key('name'));
   row.append(check(t().typeConfirm,g.typeConfirmed,v=>g.typeConfirmed=v,key('type')));
   if(g.proposalSource)row.append(el('p',getLanguage()==='en'?'Prefilled proposal. Correct or confirm the entries below.':'Vorausgefüllter Vorschlag. Bitte unten korrigieren oder bestätigen.','muted'));
   if(g.countIsMinimum)row.append(el('p',getLanguage()==='en'?'The suggested count is a visible minimum, not a complete total.':'Die vorgeschlagene Zahl ist eine sichtbare Mindestzahl, keine gesicherte Gesamtzahl.','muted'));
   if(!g.typeConfirmed)row.append(el('p',validationCopy().missing,'image-review-required-hint'));
   row.append(input(t().count,g.count,v=>{g.count=v;g.countConfirmed=false;row.querySelector('[data-count-confirm]').checked=false;},'number',key('count')));
   const c=check(t().countConfirm,g.countConfirmed,v=>g.countConfirmed=v);c.firstChild.dataset.countConfirm='';row.append(c);
   for(const [fi,f] of (g.forms??[]).entries()){
    const form=el('div',null,'image-review-form');form.append(input(t().form,f.label,v=>{f.label=v;f.confirmed=false;form.querySelector('input[type=checkbox]').checked=false;},'text',key('formLabel',fi)),check(t().formConfirm,f.confirmed,v=>f.confirmed=v,key('formConfirm',fi)),input(t().formCount,f.count,v=>{f.count=v;f.countConfirmed=false;form.querySelectorAll('input[type=checkbox]')[1].checked=false;},'number',key('formCount',fi)),check(t().countConfirm,f.countConfirmed,v=>f.countConfirmed=v),button(t().remove,()=>{g.forms.splice(fi,1);remember();}));row.append(form);
   }
   row.append(button(t().addForm,()=>{g.forms??=[];g.forms.push({label:'',confirmed:false,count:null,countConfirmed:false});remember();}));
   const boxButton=button(g.box?t().boxDone:t().box,()=>{mark={side,index};zoom=side;notice=t().marking;root.querySelector('canvas')?.scrollIntoView({block:'center',behavior:'smooth'});}),boxField=el('div');boxField.append(boxButton);row.append(attachField(boxField,boxButton,key('box')));
   if(g.box)row.append(button('×',()=>{g.box=null;remember();}));area.append(row);
  }
  area.append(button(t().add,()=>{if(s.groups.length>=64)return;s.groups.push({name:'',typeConfirmed:false,count:null,countConfirmed:false,forms:[],box:null});if(!s.verdict)s.verdict='partial';remember();}));
  area.append(check(t().complete,s.typesComplete,v=>s.typesComplete=v),check(t().empty,s.emptyConfirmed,v=>{s.emptyConfirmed=v;if(v)s.typesComplete=true;},fieldKey(side,null,'empty')));return area;
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
  controls.clear();if(validationAttempted&&item)issues=imageAnswerIssues(answer,item.cards);
  root.dataset.reviewOriginal='';root.replaceChildren();root.append(el('h3',t().title),el('p',t().intro,'muted'));
  root.append(el('p',`${data.counts.open??0} ${t().open} · ${data.counts.answered??0} ${t().answered}`));
  const bar=el('div',null,'image-review-actions');bar.append(button(t().start,async()=>{round=data.items.filter(q=>!q.answered).slice().sort((a,b)=>(b.priority??0)-(a.priority??0)||a.created-b.created).slice(0,3).map(q=>q.id);position=0;if(round.length)await open(round[0]);}),button(t().suggest,async()=>{await post('/api/image-review/suggest');await refresh();}));root.append(bar);
  const message=el('p',notice,'image-review-message');message.setAttribute('role','status');root.append(message);
  if(!data.items.length)root.append(el('p',t().none,'muted'));
  if(item){
   const codex=Object.values(item.answer?.sides??{}).some(side=>(side.actor??item.answer.actor)==='codex');
   root.append(el('h4',`${t().progress} ${position+1} ${t().of} ${Math.max(round.length,1)} · #${item.match_id.slice(0,8)} / ${item.capture_id}`));
   root.append(el('p',`${item.context.assisted?(getLanguage()==='en'?'Assisted review · excluded from independent metrics':'Unterstützte Prüfung · nicht in unabhängiger Messung'):t()[item.partition==='test'?'test':'training']} · ${item.context.language?.toUpperCase()} · ${({de:{battle_choice:'Wahl im Kampf',spell_choice:'Zauberwahl'},en:{battle_choice:'Battle choice',spell_choice:'Spell choice'}})[getLanguage()]?.[item.context.phase]??item.context.phase}`,'muted'));
   const origin=codex?(getLanguage()==='en'?'Reviewed by Codex. Optional player confirmation below.':'Von Codex geprüft. Spielerbestätigung unten bei Bedarf.'):item.blind?t().blind:t().proposal;
   root.append(el('p',origin,'image-review-message'),el('p',t().note,'muted'));
   if(item.blind)root.append(button(getLanguage()==='en'?'Show suggestions (assisted review)':'Vorschläge einblenden (unterstützte Prüfung)',async()=>{
    await post('/api/image-review/reveal',{id:item.id});item=await read('/api/image-review/item?id='+encodeURIComponent(item.id));
    const proposed=imageQuestionDraft({...item,answer:null},getLanguage());
    for(const side of ['enemy','own'])if(!answer.sides[side]?.groups?.length&&!answer.sides[side]?.verdict)answer.sides[side]=proposed.sides[side];remember();
   }));
   else root.append(button(getLanguage()==='en'?'Load proposals into unanswered sides':'Vorschläge für offene Seiten einsetzen',()=>{
    const proposed=imageQuestionDraft({...item,answer:null},getLanguage());for(const side of ['enemy','own'])if(!answer.sides[side]?.verdict)answer.sides[side]=proposed.sides[side];remember();
   }));
   const layout=el('div',null,'image-review-layout'),picture=el('div',null,'image-review-picture'),editors=el('div');canvasImage(picture);editors.append(sideEditor('enemy'),sideEditor('own'),el('p',t().boxHint,'muted'),el('p',t().formHint,'muted'),el('p',t().draft,'muted'));layout.append(picture,editors);root.append(layout);
   const submit=button(t().save,async()=>{
    validationAttempted=true;issues=imageAnswerIssues(answer,item.cards);
    if(issues.length){remember();focusIssue=issues[0].key;return;}
    const confirmed={language:getLanguage(),sides:{}};
    for(const side of ['own','enemy']){const s=answer.sides[side];if(s?.verdict)confirmed.sides[side]=s;}
    await post('/api/image-review/answer',{id:item.id,revision:item.revision,answer:confirmed});
    try{localStorage.removeItem(key());}catch{}
    item=null;answer=null;notice=t().saved;await refresh();
    if(++position<round.length)await open(round[position]);else notice=t().done+' '+t().saved;
   },'primary');editors.append(feedback(),submit,button(t().skip,()=>{item=null;answer=null;mark=null;}));
   const e=item.evaluation;editors.append(el('p',`${t().evaluation}: ${e?.running?t().running:e?.error?e.error:!e?.eligibleCases||!e?.inventory?.trainingMatches?t().waiting:e.pending?t().stale:t().ready}. ${t().idle}`,'muted'));
  }
  const list=el('details',null,'image-review-list');list.append(el('summary',`${t().all} (${data.items.length})`));
  for(const q of data.items){const row=el('div',null,'image-review-list-row');const status=q.answered&&q.codex?(getLanguage()==='en'?'Reviewed by Codex':'Von Codex geprüft'):q.answered?t().answered:t().open;
   row.append(el('span',`${q.priority?(getLanguage()==='en'?'Key image · ':'Schlüsselbild · '):''}${new Date(q.created).toLocaleString(getLanguage()==='en'?'en-GB':'de-DE')} · #${q.match_id.slice(0,8)} · ${q.capture_id} · ${status}`),button(t().edit,async()=>{round=[q.id];position=0;await open(q.id);}));
   if(q.export_status==='pending')row.append(el('small',t().pending));
   if(q.export_status==='done')row.append(el('small',t().exported));
   if(q.export_status==='failed')row.append(el('small',t().failed+': '+q.export_error),button(t().retry,async()=>{await post('/api/image-review/retry',{id:q.id});await refresh();}));list.append(row);}
  root.append(list);
  paintValidation();
  if(focusIssue){const key=focusIssue;focusIssue=null;requestAnimationFrame(()=>{const target=key==='summary'?root.querySelector('.image-review-feedback'):controls.get(key)?.control;if(target){target.scrollIntoView({block:'center',behavior:'smooth'});target.focus({preventScroll:true});}});}
 }
 return {refresh,render};
}
