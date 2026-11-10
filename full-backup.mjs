import {mkdir,mkdtemp,copyFile,readdir,lstat,rm,stat,statfs} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function stageRuntime(runtime,destination){
  await mkdir(destination,{recursive:true});
  const top=['sammlung-aktiv.json','taktikregeln.json','feld-lernstand.json','log-reset.json','loss-guard.json','partien.jsonl','antippen.jsonl','continuum.jsonl'];
  const copy=async(source,target)=>{
    const info=await lstat(source).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(!info)return;if(!info.isFile()||info.isSymbolicLink())throw Error('Sicherung enthält einen unerwarteten Dateityp.');
    await copyFile(source,target);
  };
  for(const name of top)await copy(path.join(runtime,name),path.join(destination,name));
  for(const folder of ['referenzen','vorbereitung','reports']){
    const source=path.join(runtime,folder),target=path.join(destination,folder);
    const info=await lstat(source).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(!info)continue;if(!info.isDirectory()||info.isSymbolicLink())throw Error('Sicherungsverzeichnis ist kein normales Verzeichnis.');
    await mkdir(target,{recursive:true});
    for(const name of await readdir(source))if(/\.(png|json)$/.test(name))await copy(path.join(source,name),path.join(target,name));
  }
}

export async function sendFullBackup(response,{runtime,databaseFile,copyDatabase,python}){
  const directory=await mkdtemp(path.join(tmpdir(),'draft-coach-full-'));
  try{
    const size=(await stat(databaseFile)).size,space=await statfs(directory);
    if(Number(space.bavail)*Number(space.bsize)<size*2+200*1024*1024)throw Error('Zu wenig freier Speicher für die vollständige Sicherung.');
    const snapshot=path.join(directory,'snapshot');await mkdir(snapshot);
    await copyDatabase(path.join(snapshot,'Draft-Coach.sqlite3'));
    await stageRuntime(runtime,path.join(snapshot,'runtime'));
    const bundle=path.join(directory,'Draft-Coach-Backup.zip');
    await new Promise((resolve,reject)=>{
      const child=spawn(python,[fileURLToPath(new URL('./backup-files.py',import.meta.url)),'create',snapshot,bundle],{windowsHide:true});
      let error='';child.stderr.on('data',chunk=>error+=chunk.toString());child.on('error',reject);
      child.on('close',code=>code===0?resolve():reject(Error(error.slice(-500)||'Sicherung fehlgeschlagen.')));
    });
    response.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="Draft-Coach-Backup.zip"',
      'Content-Length':(await stat(bundle)).size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    await pipeline(createReadStream(bundle),response);
  }finally{await rm(directory,{recursive:true,force:true});}
}
