import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptArmyObservation,updateArmyHistory,armyPilotGate} from './army-state.mjs';
import {plainGame,snapshotMatch,restoreMatch} from './match-store.mjs';
const packet=(frameId=1,capturedAt=1000)=>({frameId,capturedAt,matchId:'game',device:'usb',phase:'battle_choice',language:'en',
  sides:{own:{groups:[{name:'Schnecke',visibleMinimum:3,forms:[],unknownFormCount:3}],instances:[{name:'Schnecke',box:[20,1600,100,1700]}]},enemy:{groups:[],instances:[]}}});
const options={now:1100,frameId:1,matchId:'game',device:'usb',expectedOwn:{Schnecke:1},values:{own:{Schnecke:{level:12,stars:9}}}};
test('rejects stale, foreign and out-of-order army snapshots',()=>{
  for(const change of [{matchId:'other'},{device:'wifi'},{capturedAt:-6000},{capturedAt:1200},{frameId:2}])assert.equal(acceptArmyObservation({...packet(),...change},null,options),null);
  const first=acceptArmyObservation(packet(),null,options);
  assert.equal(acceptArmyObservation(packet(),first,options),null);
});
test('records manual-choice discrepancies without changing built forces or claiming total counts',()=>{
  const observation=acceptArmyObservation(packet(),null,options),row=observation.sides.own.groups[0];
  assert.equal(row.visibleMinimum,3);assert.equal(row.visibleMaximum,null);assert.equal(row.actionCountConflict,true);
  assert.equal(row.level,12);assert.equal(row.stars,9);assert.equal(row.confidence.form,'unknown');assert.equal(observation.strength.universalTotal,null);
  const match={id:'game',started:1000,captureIds:[1],ownReinforcements:new Map([['Schnecke',1]])};
  updateArmyHistory(match,observation);
  const combat=acceptArmyObservation({...packet(2,1200),phase:'battle'},observation,{...options,now:1300,frameId:2});
  updateArmyHistory(match,combat);
  assert.equal(match.lastObservedFormation.frameId,1);assert.equal(match.lastCombatPositions.frameId,2);
  assert.equal(match.ownReinforcements.get('Schnecke'),1);assert.equal(combat.ownership,'spatial_only');
  assert.equal(plainGame(match).armyObservations.length,2);
  assert.equal(restoreMatch(snapshotMatch(match)).lastObservedFormation.frameId,1);
});
test('temporal agreement is context-specific and does not promote model confidence',()=>{
  const first=acceptArmyObservation(packet(),null,options);
  const second=acceptArmyObservation(packet(2,1500),first,{...options,frameId:2,now:1600});
  assert.equal(second.sides.own.groups[0].observedConsecutively,2);
  assert.equal(second.sides.own.instances[0].trackId,first.sides.own.instances[0].trackId);
  assert.equal(second.sides.own.instances[0].trackFrames,2);
  assert.equal(second.sides.own.typeReliable,false);
  const combat=acceptArmyObservation({...packet(3,1700),phase:'battle'},second,{...options,frameId:3,now:1800});
  assert.equal(combat.sides.own.groups[0].observedConsecutively,1);
  assert.notEqual(combat.sides.own.instances[0].trackId,second.sides.own.instances[0].trackId);
});
test('storage budgets preserve summaries while bounding detailed boxes and history',()=>{
  const match={id:'game'};
  for(let id=1;id<=80;id++){
    const p=packet(id,1000+id),raw=p.sides.own;
    raw.instances=Array.from({length:100},()=>({name:'Schnecke',box:[20,1600,100,1700]}));
    const observed=acceptArmyObservation(p,null,{...options,now:2000,frameId:100});
    updateArmyHistory(match,observed);
  }
  assert.equal(match.armyObservations.length,60);
  assert.equal(match.lastObservedFormation.sides.own.instances.length,40);
  assert.equal(match.lastObservedFormation.sides.own.instanceRecordsTruncated,true);
  assert.equal(match.lastObservedFormation.sides.own.groups[0].visibleMinimum,3);
});
test('aggregate success cannot hide a weak type, count and evolution remain separately gated',()=>{
  const good={images:30,matches:5,precision:1,recall:1,errors:0,latency:{p95:300},types:Object.fromEntries(['A','B','C'].map(name=>[name,{tp:10,fn:0,precision:1,recall:1}]))};
  assert.equal(armyPilotGate(good).typeReady,true);assert.equal(armyPilotGate(good).countReady,false);
  assert.equal(armyPilotGate({...good,types:{...good.types,C:{tp:1,fn:1,precision:1,recall:.5}}}).typeReady,false);
  assert.equal(armyPilotGate({...good,latency:{p95:1000}}).typeReady,false);
  assert.equal(armyPilotGate(null).typeReady,false);assert.equal(armyPilotGate(good).liveAdviceEnabled,false);
});
