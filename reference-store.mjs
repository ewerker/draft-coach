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
    const temporary=meta(id)+'.tmp';
    await writeFile(temporary,JSON.stringify(item));await renameSafe(temporary,meta(id));
    return item;
  }
  async function renameSafe(from,to){const {rename}=await import('node:fs/promises');await rename(from,to);}
  async function remove(id){if(!valid(id))throw Error('Ungültige Referenz.');await unlink(meta(id));await unlink(image(id)).catch(()=>{});}
  return {list,add,correct,remove,image,valid};
}
