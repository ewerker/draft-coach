import {mkdir,readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

export async function createReferenceStore(root){
  await mkdir(root,{recursive:true});
  const valid=id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id);
  const meta=id=>path.join(root,id+'.json');
  const image=id=>path.join(root,id+'.png');
  async function list(){
    const entries=await Promise.all((await readdir(root)).filter(name=>/^[a-f0-9]{24}\.json$/.test(name)).map(async name=>{
      try{return JSON.parse(await readFile(path.join(root,name),'utf8'));}catch{return null;}
    }));
    return entries.filter(e=>e&&valid(e.id)).sort((a,b)=>b.at-a.at);
  }
  async function add(png,details={}){
    const id=randomBytes(12).toString('hex');
    const item={id,at:Date.now(),source:details.source||'manual',phase:details.phase||null,language:details.language||'de',issues:details.issues||[],matchId:details.matchId??null,captureId:details.captureId??null,corrections:[]};
    await writeFile(image(id),png,{flag:'wx'});
    try{await writeFile(meta(id),JSON.stringify(item),{flag:'wx'});}catch(e){await unlink(image(id)).catch(()=>{});throw e;}
    return item;
  }
  async function correct(id,correction){
    if(!valid(id))throw Error('Ungültige Referenz.');
    const item=JSON.parse(await readFile(meta(id),'utf8'));
    item.corrections=(item.corrections||[]).filter(c=>c.position!==correction.position||c.phase!==correction.phase);
    item.corrections.push(correction);
    if(correction.phase.endsWith('_field')&&item.fieldConfirmations)delete item.fieldConfirmations[correction.phase.slice(0,-6)];
    if(correction.phase.endsWith('_field')&&item.complete) item.complete[correction.phase.slice(0,-6)]=false;
    const temporary=meta(id)+'.tmp';
    await writeFile(temporary,JSON.stringify(item));await renameSafe(temporary,meta(id));
    return item;
  }
  async function setComplete(id,side,complete){
    if(!valid(id)||!['own','enemy'].includes(side)||typeof complete!=='boolean')throw Error('Ungültige Prüfangabe.');
    const item=JSON.parse(await readFile(meta(id),'utf8'));
    item.complete={...item.complete,[side]:complete};
    if(item.fieldConfirmations)delete item.fieldConfirmations[side];
    const temporary=meta(id)+'.tmp';await writeFile(temporary,JSON.stringify(item));await renameSafe(temporary,meta(id));
    return item;
  }
  async function keepFieldPositions(id,side,positions){
    if(!valid(id)||!['own','enemy'].includes(side)||!Array.isArray(positions)||positions.some(p=>!Number.isInteger(p)||p<0||p>3))throw Error('Ungültige Prüfangabe.');
    const item=JSON.parse(await readFile(meta(id),'utf8'));
    item.corrections=(item.corrections||[]).filter(c=>c.phase!==side+'_field'||positions.includes(c.position));
    item.complete={...item.complete,[side]:false};
    if(item.fieldConfirmations)delete item.fieldConfirmations[side];
    const temporary=meta(id)+'.tmp';await writeFile(temporary,JSON.stringify(item));await renameSafe(temporary,meta(id));
    return item;
  }
  async function renameSafe(from,to){const {rename}=await import('node:fs/promises');await rename(from,to);}
  async function confirmField(id,question){
    if(!valid(id))throw Error('Ungültige Referenz.');
    const item=JSON.parse(await readFile(meta(id),'utf8'));
    item.fieldConfirmations??={};
    for(const [side,value] of Object.entries(question.answer.sides)){
      // "Cannot assess" withdraws only this question's earlier answer, never a
      // separate player's existing annotations.
      if(value.verdict==='unassessable'){
        if(item.fieldConfirmations[side]?.questionId===question.id)delete item.fieldConfirmations[side];
        continue;
      }
      item.fieldConfirmations[side]={...value,questionId:question.id,revision:question.revision,actor:'player',confirmedAt:Date.now()};
    }
    item.guidedQuestionId=question.id;item.imageHash=question.image_hash;item.reviewPurpose=question.purpose;
    const temporary=meta(id)+'.tmp';await writeFile(temporary,JSON.stringify(item));await renameSafe(temporary,meta(id));return item;
  }
  async function remove(id){if(!valid(id))throw Error('Ungültige Referenz.');await unlink(meta(id));await unlink(image(id)).catch(()=>{});}
  return {list,add,correct,setComplete,keepFieldPositions,confirmField,remove,image,valid};
}
