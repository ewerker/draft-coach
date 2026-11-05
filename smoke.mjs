import assert from 'node:assert/strict';
const root='http://127.0.0.1:4317';
async function get(p){const r=await fetch(root+p);assert(r.ok);return r.json();}
const {token}=await get('/api/config');
async function post(p,body){const r=await fetch(root+p,{method:'POST',headers:{'Content-Type':'application/json','X-Coach-Token':token},body:JSON.stringify(body)});const data=await r.json();assert(r.ok,JSON.stringify(data));return data;}
assert.equal((await fetch(root+'/')).status,200);
assert.equal((await fetch(root+'/api/capture',{method:'POST'})).status,403);
assert.equal((await fetch(root+'/reference/unknown.png')).status,404);
const devices=await get('/api/devices');console.log('Erkannte Geräte:',devices.devices.map(d=>({status:d.status,transport:d.transport,model:d.model})));
const ref=await post('/api/reference',{file:'schlacht-teil-2.png'});
async function wait(id){for(let i=0;i<50;i++){const s=await get('/api/state');if(s.current?.id===id)return s.current;if(s.error)throw Error(s.error);await new Promise(r=>setTimeout(r,100));}throw Error('Zeitüberschreitung');}
const reference=await wait(ref.id);assert.deepEqual(reference.offers.map(o=>o.name),['Boomling','Ritter','Kapitän']);console.log('Referenzprüfung bestanden, Erkennung:',reference.visionMs,'ms');
const shot=await post('/api/capture',{});const live=await wait(shot.id);assert.equal((await fetch(root+live.image)).headers.get('content-type'),'image/png');console.log('WLAN-Aufnahme und lokale Erkennung bestanden:',{phase:live.phase,captureMs:live.captureMs,visionMs:live.visionMs,totalMs:live.ageMs});
await post('/api/reference',{file:'schlacht-teil-2.png'});
