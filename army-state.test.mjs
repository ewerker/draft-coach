import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptArmyObservation,updateArmyHistory,armyPilotGate,rememberArmyAdvice} from './army-state.mjs';
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

test('formation sightings accumulate across the match without counting the same troops again',()=>{
  const p=packet();
  p.sides.enemy.groups=[
    {name:'Agent B',visibleMinimum:4,similarity:.95},
    {name:'Ingenieur',visibleMinimum:2,similarity:.96,poolConflict:true},
    {name:'Sniper',visibleMinimum:1,similarity:.85}
  ];
  p.sides.enemy.instances=[
    {name:'Agent B',box:[50,400,130,480],score:.93},
    {name:'Agent B',box:[150,400,230,480],score:.91}
  ];
  const first=acceptArmyObservation(p,null,options);
  const context={now:2000,matchId:'game',device:'usb',frameId:4,
    knownEnemy:new Set(['Agent B','Sniper']),knownOwn:new Set(['Schnecke']),
    unitNames:new Set(['Agent B','Ingenieur','Sniper','Schnecke']),completeEnemyDeck:false};
  const firstMemory=rememberArmyAdvice(null,first,context);
  assert.deepEqual(firstMemory.enemy,[{name:'Agent B',minimum:2,capture:1}]);
  const second=acceptArmyObservation({...p,frameId:2,capturedAt:1300},first,{...options,frameId:2,now:1400});
  const memory=rememberArmyAdvice(firstMemory,second,context);
  assert.deepEqual(memory.enemy,[{name:'Agent B',minimum:2,capture:1},{name:'Ingenieur',minimum:1,capture:2}]);
  assert.deepEqual(rememberArmyAdvice(firstMemory,second,{...context,completeEnemyDeck:true}).enemy,firstMemory.enemy);
  const empty={...second,frameId:3,sides:{own:{groups:[]},enemy:{groups:[]}}};
  const afterEmpty=rememberArmyAdvice(memory,empty,context);
  assert.deepEqual(afterEmpty.enemy,memory.enemy);
  const later={...second,frameId:4,capturedAt:60000};
  later.sides.enemy.instances.push({name:'Agent B',box:[250,400,330,480],score:.95});
  const afterRound=rememberArmyAdvice(afterEmpty,later,{...context,now:61000});
  assert.equal(afterRound.enemy[0].minimum,3);
  assert.equal(afterRound.enemy[0].capture,4);
  assert.equal(rememberArmyAdvice(afterRound,{...later,frameId:5,context:'combat_positions'},{...context,now:61000,frameId:5}),afterRound);
  for(const change of [{device:'wifi'},{matchId:'another'}])
    assert.equal(rememberArmyAdvice(afterRound,later,{...context,now:61000,...change}),null);
  assert.equal(rememberArmyAdvice(afterEmpty,later,{...context,now:67000}),afterEmpty);
  assert.deepEqual(restoreMatch(snapshotMatch({id:'game',started:1000,captureIds:[1,2,3,4],armyAdviceMemory:afterRound})).armyAdviceMemory,afterRound);
});
