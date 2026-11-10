import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createArmyService} from './army-service.mjs';
const python=process.env.PYTHON_PATH||(process.platform==='win32'?'python':'python3');
test('army worker keeps only latest waiting frame and cannot block caller',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'coach-army-'));
  let service;
  try{
    await writeFile(path.join(root,'army-worker.py'),`import sys,json,time\nprint(json.dumps({'ready':True}),flush=True)\nfor line in sys.stdin:\n r=json.loads(line);time.sleep(.06);print(json.dumps({'id':r['id'],'result':{'frameId':r['id']}}),flush=True)\n`);
    const frames=[];
    const completed=Promise.withResolvers();
    service=createArmyService({python,root,onResult:result=>{frames.push(result.frameId);if(result.frameId===3)completed.resolve();},onError:message=>completed.reject(Error(message))});
    service.submit({id:1});service.submit({id:2});service.submit({id:3});
    await Promise.race([completed.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('worker timeout')),5000).unref())]);
    assert.equal(frames.at(-1),3);assert.ok(!frames.includes(2));assert.ok(service.status().discarded>=1);
  }finally{service?.close();await rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:25});}
});
test('army timeouts stop only the analysis service and reject further unbounded work',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'coach-army-'));
  let service;
  try{
    await writeFile(path.join(root,'army-worker.py'),`import sys,json,time\nprint(json.dumps({'ready':True}),flush=True)\nfor line in sys.stdin: time.sleep(20)\n`);
    const failed=Promise.withResolvers();
    service=createArmyService({python,root,timeoutMs:60,onResult:()=>assert.fail('timed-out result'),onError:failed.resolve});
    service.submit({id:1});assert.equal(await failed.promise,'ARMY_TIMEOUT');
    assert.equal(service.submit({id:2}),false);assert.equal(service.status().running,false);
  }finally{service?.close();await rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:25});}
});
