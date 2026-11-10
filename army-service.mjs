import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {setPriority,constants} from 'node:os';
import path from 'node:path';

// One running frame and one replacement. A growing queue must never delay taps.
export function createArmyService({python,root,env=process.env,onResult,onError=()=>{},timeoutMs=2200}){
  let child=null,ready=false,waiting=null,pending=null,timer=null,closed=false,disabled=false;
  const status={running:false,pending:false,ready:false,error:null,processed:0,discarded:0};
  const clear=()=>{clearTimeout(timer);timer=null;waiting=null;status.running=false;};
  function fail(message){
    clear();pending=null;status.pending=false;status.ready=false;status.error=message;ready=false;disabled=true;
    const old=child;child=null;old?.kill();onError(message);
  }
  function send(){
    if(closed||disabled||!ready||waiting||!pending)return;
    waiting=pending;pending=null;status.pending=false;status.running=true;
    timer=setTimeout(()=>fail('ARMY_TIMEOUT'),timeoutMs);
    child.stdin.write(JSON.stringify(waiting)+'\n');
  }
  function start(){
    if(child||closed||disabled)return;
    child=spawn(python,[path.join(root,'army-worker.py')],{cwd:root,windowsHide:true,env:{...env,PYTHONIOENCODING:'utf-8',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1'}});
    try{setPriority(child.pid,constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
    const current=child;
    timer=setTimeout(()=>fail('ARMY_START_TIMEOUT'),10000);
    child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
    child.on('error',error=>{if(current===child)fail(error.message);});
    child.on('exit',code=>{if(current===child&&!closed)fail('ARMY_EXIT_'+code);});
    readline.createInterface({input:child.stdout}).on('line',line=>{
      if(current!==child||closed)return;
      try{
        const message=JSON.parse(line);
        if(message.ready){clearTimeout(timer);ready=true;status.ready=true;send();return;}
        if(!waiting||message.id!==waiting.id)return;
        const request=waiting;clear();
        if(message.error){status.error=message.error;onError(message.error);}
        else{status.processed++;status.error=null;onResult({...message.result,device:request.device});}
        send();
      }catch(error){fail(error.message);}
    });
  }
  return {
    submit(request){if(closed||disabled)return false;if(pending)status.discarded++;pending=request;status.pending=true;start();send();return true;},
    status:()=>({...status}),
    reset(){disabled=false;status.error=null;},
    close(){closed=true;clear();pending=null;child?.kill();child=null;}
  };
}
