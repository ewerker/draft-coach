// Run from a clean source checkout after synchronizing the target installation.
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const target=process.argv[2]?path.resolve(process.argv[2]):null;
if(!target)throw Error('Usage: node stamp-build.mjs <installation-directory>');
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true}).trim();
if(git('status','--porcelain','--untracked-files=no'))throw Error('Commit tracked source changes before stamping a deployment.');
const source=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const deployed=JSON.parse(await readFile(path.join(target,'package.json'),'utf8'));
if(source.version!==deployed.version)throw Error('Source and installation versions do not match.');
const info={version:source.version,number:Number(git('rev-list','--count','HEAD')),commit:git('rev-parse','--short=12','HEAD')};
if(!Number.isSafeInteger(info.number)||info.number<1||!/^[a-f0-9]{7,12}$/i.test(info.commit))throw Error('Invalid Git build identity.');
const dir=path.join(target,'runtime');await mkdir(dir,{recursive:true});
const file=path.join(dir,'build-info.json'),temp=file+'.tmp';
await writeFile(temp,JSON.stringify(info,null,2)+'\n');await rename(temp,file);
console.log(`Stamped ${info.version} · Build ${info.number} · ${info.commit}`);
