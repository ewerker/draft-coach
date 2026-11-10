import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Writable} from 'node:stream';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createArchive} from './archive.mjs';
import {stageRuntime} from './full-backup.mjs';
const execute=promisify(execFile),python=process.env.PYTHON_PATH||(process.platform==='win32'?'python':'python3');
const helper=fileURLToPath(new URL('./backup-files.py',import.meta.url));

test('a full backup restores SQLite knowledge, rule versions, review images and reports but excludes credentials',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'coach-full-test-'));
  try{
    const runtime=path.join(dir,'runtime');await mkdir(path.join(runtime,'referenzen'),{recursive:true});await mkdir(path.join(runtime,'reports'));
    const rules='[{"id":"r","title":"Saved rule"}]';await writeFile(path.join(runtime,'taktikregeln.json'),rules);
    await writeFile(path.join(runtime,'openai-key.txt'),'never-export-test-secret');await writeFile(path.join(runtime,'lan-passwort.txt'),'private-password');
    await writeFile(path.join(runtime,'referenzen','test.json'),JSON.stringify({id:'ref',corrections:[{name:'Schnecke'}]}));
    await writeFile(path.join(runtime,'referenzen','test.png'),Buffer.from('test-image'));
    await writeFile(path.join(runtime,'reports','test.json'),'{}');await writeFile(path.join(runtime,'loss-guard.json'),'{"enabled":true}');
    const file=path.join(dir,'archive.sqlite3'),archive=createArchive(file,runtime);await archive.initializeReview();
    const note=await archive.knowledge.create({kind:'mechanic',language:'de',title:'Allgemein',reason:'Unabhängig von einer Karte.'});
    const version=await archive.runs.version('rules',{id:'saved-version'});
    const chunks=[];let headers;
    const response=new Writable({write(chunk,_encoding,callback){chunks.push(Buffer.from(chunk));callback();}});
    response.writeHead=(_status,value)=>{headers=value;};
    await archive.sendBundle(response,python);assert.equal(headers['Content-Type'],'application/zip');
    const bundle=path.join(dir,'backup.zip');await writeFile(bundle,Buffer.concat(chunks));
    const target=path.join(dir,'restored');await execute(python,[helper,'restore',bundle,target]);
    const db=new DatabaseSync(path.join(target,'Draft-Coach.sqlite3'));
    try{assert.ok(db.prepare('SELECT 1 FROM knowledge_items WHERE id=?').get(note.id));assert.ok(db.prepare('SELECT 1 FROM runtime_versions WHERE hash=?').get(version));}finally{db.close();}
    assert.equal(await readFile(path.join(target,'runtime','taktikregeln.json'),'utf8'),rules);
    assert.equal(await readFile(path.join(target,'runtime','referenzen','test.png'),'utf8'),'test-image');
    assert.ok((await readdir(path.join(target,'runtime'))).includes('loss-guard.json'));
    await assert.rejects(readFile(path.join(target,'runtime','openai-key.txt')));
    await assert.rejects(readFile(path.join(target,'runtime','lan-passwort.txt')));
    await assert.rejects(execute(python,[helper,'restore',bundle,target]));
    assert.equal(await readFile(path.join(target,'runtime','taktikregeln.json'),'utf8'),rules);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('restore rejects path traversal, unexpected files and checksum damage before publishing a restored directory',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'coach-invalid-backup-'));
  try{
    for(const name of ['../escape.txt','runtime/openai-key.txt','runtime/taktikregeln.json']){
      const file=path.join(dir,'invalid.zip'),target=path.join(dir,'restored');
      const script="import zipfile,json,sys; name=sys.argv[2]; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr(name,'bad'); z.writestr('manifest.json',json.dumps({'format':'draft-coach-backup','version':1,'files':[{'path':name,'size':3,'sha256':'invalid'}]})); z.close()";
      await execute(python,['-c',script,file,name]);await assert.rejects(execute(python,[helper,'restore',file,target]));
      await assert.rejects(readdir(target));await assert.rejects(readFile(path.join(dir,'escape.txt')));
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('runtime staging uses an allowlist rather than copying the whole private runtime directory',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'coach-stage-'));
  try{
    const source=path.join(dir,'source'),target=path.join(dir,'staged');await mkdir(source);
    for(const name of ['taktikregeln.json','partien.jsonl','openai-key.txt','.env','capture-1.png','unrelated.json'])await writeFile(path.join(source,name),'test');
    await stageRuntime(source,target);assert.deepEqual((await readdir(target)).sort(),['partien.jsonl','taktikregeln.json']);
  }finally{await rm(dir,{recursive:true,force:true});}
});
