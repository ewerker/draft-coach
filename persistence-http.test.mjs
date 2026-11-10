import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';

const source=fileURLToPath(new URL('.',import.meta.url));
const python=process.env.PYTHON_PATH||(process.platform==='win32'?'python':'python3');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(fn){let error;for(let i=0;i<100;i++){try{const value=await fn();if(value)return value;}catch(e){error=e;}await delay(80);}throw error??Error('Condition not reached');}

test('HTTP lifecycle: capture, stop/restart, explicit resume, one result, background report and second-restart recovery',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'coach-http-p2-'));
  let child,token,port,logs='';
  const client='a'.repeat(32);
  const get=async route=>{const response=await fetch(`http://127.0.0.1:${port}${route}`,{headers:{'X-Coach-Client':client},signal:AbortSignal.timeout(2000)});const value=await response.json();if(!response.ok)throw Error(value.error);return value;};
  const post=async(route,data={})=>{const response=await fetch(`http://127.0.0.1:${port}${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-Coach-Token':token,'X-Coach-Client':client},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});const value=await response.json();if(!response.ok)throw Error(value.error);return value;};
  async function start(){
    child=spawn(process.execPath,['server.mjs'],{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
      PORT:String(port),COACH_MODE:'draft',COACH_LAN_ADDRESS:'',PYTHON_PATH:python,ADB_PATH:python,ADB_DEVICE:'test-device',OPENAI_API_KEY:''}});
    child.on('error',()=>{});
    child.stderr.on('data',chunk=>logs+=chunk.toString());child.stdout.on('data',chunk=>logs+=chunk.toString());
    token=(await eventually(()=>get('/api/config'))).token;
    await eventually(async()=>{const state=await get('/api/state');return state.ready&&!state.capturing;});
  }
  async function stop(){const exited=once(child,'exit');await post('/api/desktop/stop');await exited;child=null;}
  async function capture(){const result=await post('/api/capture');await eventually(async()=>{const state=await get('/api/state');return state.current?.id===result.id&&!state.recognizing;});return result.id;}
  try{
    const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    for(const file of await readdir(source))if(/\.(mjs|json|py)$/.test(file))await cp(path.join(source,file),path.join(dir,file));
    await cp(path.join(source,'data'),path.join(dir,'data'),{recursive:true});await cp(path.join(source,'public'),path.join(dir,'public'),{recursive:true});
    await mkdir(path.join(dir,'references'));
    await writeFile(path.join(dir,'test-device'),"import sys\nfrom pathlib import Path\nif 'exec-out' in sys.argv: sys.stdout.buffer.write(Path('data/opponent-deck-30830.png').read_bytes())\n");
    await writeFile(path.join(dir,'devices'),"print('List of devices attached\\ntest-device device model:Test_Device')\n");
    const worker=`import sys,json
print(json.dumps({'ready':True}),flush=True)
for line in sys.stdin:
 j=json.loads(line); g={'width':1080,'height':2340,'content':[0,0,1080,2340],'referenceWidth':1080,'referenceHeight':2340}
 offers=[{'name':name,'position':i,'action':'add','quantity':2,'box':[40+i*340,1000,300+i*340,1500],'similarity':0.99,'margin':0.3} for i,name in enumerate(['Agent B','Merlinor','Schnecke'])]
 print(json.dumps({'id':j['id'],'geometry':g,'phase':'battle_choice','offers':offers,'enemy':[],'own':[],'visionMs':1}),flush=True)
`;
    await writeFile(path.join(dir,'vision.py'),worker);
    await start();const first=await capture();const original=(await get('/api/state')).activeMatchId;assert.ok(original);
    await stop();await start();
    let state=await get('/api/state');assert.equal(state.activeMatchId,null);assert.equal(state.auto,false);assert.equal(state.recoveryMatches.length,1);assert.equal(state.recoveryMatches[0].id,original);
    await assert.rejects(post('/api/capture'),/offene Partie/);assert.equal((await get('/api/state')).capturing,false);
    await post('/api/matches/recover',{id:original,action:'resume'});assert.equal((await get('/api/state')).activeMatchId,original);
    const second=await capture();assert.ok(second>first);await post('/api/partie/stopp');
    await post('/api/partie/ergebnis',{matchId:original,outcome:'gewonnen'});
    assert.equal((await post('/api/partie/ergebnis',{matchId:original,outcome:'gewonnen'})).alreadySaved,true);
    const jobs=await eventually(async()=>{const value=await get('/api/admin/jobs');return value.jobs.length===2&&value.jobs.every(j=>j.status==='done')?value:null;});
    assert.equal(jobs.images.assets,1);assert.equal(jobs.images.images,2);
    const report=jobs.jobs.find(j=>j.kind==='prepare_review').report;assert.equal(report.decisions,2);assert.equal(report.missingVersions,0);assert.equal(report.tacticalEffect,'not_tested');
    state=await get('/api/state');assert.equal(state.matchStats.draft.won,1);assert.equal(state.matchStats.draft.lost,0);
    const reviewed=await get('/api/admin/review/match?id='+original);assert.deepEqual(reviewed.captureIds,[first,second]);
    const games=await get('/api/admin/review/matches');assert.equal(games.games.filter(g=>g.id===original).length,1);
    await capture();const partial=(await get('/api/state')).activeMatchId;assert.notEqual(partial,original);
    await stop();await start();state=await get('/api/state');assert.equal(state.recoveryMatches[0].id,partial);assert.equal(state.matchStats.draft.won,1);
    await post('/api/matches/recover',{id:partial,action:'unbekannt'});state=await get('/api/state');assert.equal(state.recoveryMatches.length,0);assert.equal(state.matchStats.draft.won,1);assert.equal(state.matchStats.draft.lost,0);
  }catch(error){throw Error(error.message+'\n'+logs,{cause:error});}
  finally{
    if(child){try{await stop();}catch{const process=child;if(process.exitCode===null){const exited=once(process,'exit');process.kill();await exited;}}}
    await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
