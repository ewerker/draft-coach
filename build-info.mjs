import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const run=promisify(execFile);

// Resolve once at startup: a running server must keep its own build identity.
export async function resolveBuild(root,version){
  if(existsSync(path.join(root,'.git'))){
    try{
      const git=async (...args)=>(await run('git',['-C',root,...args],{timeout:5000,windowsHide:true})).stdout.trim();
      const count=Number(await git('rev-list','--count','HEAD'));
      const commit=await git('rev-parse','--short=12','HEAD');
      const dirty=Boolean(await git('status','--porcelain','--untracked-files=no'));
      if(Number.isSafeInteger(count)&&count>0&&/^[a-f0-9]{7,12}$/i.test(commit))return {number:count,commit,dirty,source:'git'};
    }catch{}
  }
  try{
    const info=JSON.parse(await readFile(path.join(root,'runtime','build-info.json'),'utf8'));
    if(info.version===version&&Number.isSafeInteger(info.number)&&info.number>0&&/^[a-f0-9]{7,12}$/i.test(info.commit))
      return {number:info.number,commit:info.commit,dirty:info.dirty===true,source:'stamp',differences:Array.isArray(info.differences)?info.differences.filter(item=>typeof item==='string').slice(0,100):[]};
  }catch{}
  return null;
}
