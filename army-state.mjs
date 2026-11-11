// Visual evidence is separate from choices sent to the device and battle survivors.
export const armyFreshMs=6000;
const formationAgreementMs=20000;
const canonical=name=>name==='Verwüster'?'Zerstörer':name==='Bientank'?'Bienenkorb':name;
const validBox=box=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]<=1080&&box[3]<=2340&&box[2]>box[0]&&box[3]>box[1];

export function acceptArmyObservation(packet,previous,{now=Date.now(),matchId,device,frameId,values={},expectedOwn={}}={}){
  if(!packet||!Number.isSafeInteger(packet.frameId)||packet.frameId<1||!['battle_choice','spell_choice','battle'].includes(packet.phase)||packet.matchId!==matchId||packet.device!==device||!Number.isFinite(packet.capturedAt)||
    packet.capturedAt>now||now-packet.capturedAt>armyFreshMs||packet.frameId>frameId||
    previous&&packet.frameId<=previous.frameId)return null;
  const context=['battle_choice','spell_choice'].includes(packet.phase)?'formation':'combat_positions';
  const temporallyComparable=previous?.context===context&&previous?.matchId===matchId&&previous?.device===device&&
    packet.capturedAt-previous.capturedAt>0&&packet.capturedAt-previous.capturedAt<=armyFreshMs;
  const sides={};
  for(const side of ['own','enemy']){
    const raw=packet.sides?.[side]??{},old=temporallyComparable?previous.sides?.[side]:null;
    const usedTracks=new Set();
    const instances=(raw.instances??[]).filter(r=>r.name&&validBox(r.box)).map((row,index)=>{
      const name=canonical(row.name),[x1,y1,x2,y2]=row.box;
      const preceding=old?.instances.filter(candidate=>candidate.name===name&&!usedTracks.has(candidate.trackId))
        .map(candidate=>({candidate,distance:Math.hypot((candidate.box[0]+candidate.box[2]-x1-x2)/2,(candidate.box[1]+candidate.box[3]-y1-y2)/2)}))
        .sort((a,b)=>a.distance-b.distance)[0];
      const linked=preceding&&preceding.distance<Math.max(x2-x1,y2-y1)*.6?preceding.candidate:null;
      if(linked)usedTracks.add(linked.trackId);
      return {...row,name,trackId:linked?.trackId??`${packet.frameId}:${side}:${index}`,trackFrames:linked?(linked.trackFrames??1)+1:1};
    });
    const groups=(raw.groups??[]).filter(r=>r.name&&Number.isSafeInteger(r.visibleMinimum)&&r.visibleMinimum>0).map(row=>{
      const name=canonical(row.name),seenBefore=old?.groups.some(r=>r.name===name);
      const card=values[side]?.[name]??{};
      return {name,visibleMinimum:row.visibleMinimum,visibleMaximum:null,
        confidence:{type:'candidate',count:'lower_bound',form:'unknown'},
        forms:(row.forms??[]).filter(f=>Number.isSafeInteger(f.stage)&&f.stage>=0&&Number.isSafeInteger(f.visibleMinimum)&&f.visibleMinimum>0),
        unknownFormCount:Number.isSafeInteger(row.unknownFormCount)?row.unknownFormCount:row.visibleMinimum,
        observedConsecutively:seenBefore?(old.groups.find(r=>r.name===name).observedConsecutively??1)+1:1,
        // Matching across frames supports identity, but is not an independent accuracy test.
        similarity:row.similarity??null,poolConflict:Boolean(row.poolConflict),
        level:Number.isSafeInteger(card.level)?card.level:null,stars:Number.isSafeInteger(card.stars)?card.stars:null,
        expectedFromActions:side==='own'&&Number.isSafeInteger(expectedOwn[name])?expectedOwn[name]:null,
        actionCountConflict:side==='own'&&Number.isSafeInteger(expectedOwn[name])&&row.visibleMinimum>expectedOwn[name]};
    });
    sides[side]={groups,instances,unknownRegions:raw.unknownRegions??[],completeness:'unknown',
      countReliable:false,typeReliable:false,formReliable:false,elapsedMs:raw.elapsedMs??null,truncated:Boolean(raw.truncated)};
  }
  return {schemaVersion:1,frameId:packet.frameId,matchId,device,capturedAt:packet.capturedAt,
    receivedAt:now,ageMs:now-packet.capturedAt,phase:packet.phase,language:packet.language,geometry:packet.geometry,
    context,ownership:context==='formation'?'spatial_formation':'spatial_only',sides,
    backend:packet.backend,modelRevision:packet.modelRevision,elapsedMs:packet.elapsedMs,
    use:'observation_only',actualChoice:'not_inferred',strength:{kind:'per_type_profile',universalTotal:null}};
}

export function updateArmyHistory(match,observation){
  if(!match||match.id!==observation?.matchId)return;
  // Bound recurring SQLite checkpoints. Preserve count summaries and a useful
  // sample of boxes, and say explicitly when not all boxes were recorded.
  const saved={...observation,sides:Object.fromEntries(['own','enemy'].map(side=>{
    const row=observation.sides[side];
    return [side,{...row,instances:row.instances.slice(0,40),unknownRegions:row.unknownRegions.slice(0,8),
      instanceRecordsTruncated:row.instances.length>40||row.unknownRegions.length>8}];
  }))};
  match.armyObservations??=[];
  match.armyObservations.push(saved);
  if(match.armyObservations.length>60)match.armyObservations.shift();
  if(observation.context==='formation')match.lastObservedFormation=saved;
  else match.lastCombatPositions=saved;
  // Never replace built forces or ownReinforcements using survivors or lower bounds.
}

export function rememberArmyAdvice(previous,observation,{now,matchId,device,frameId,knownEnemy,knownOwn,unitNames,completeEnemyDeck,recentObservations=[]}){
  const memory=previous?.matchId===matchId&&previous?.device===device?previous:null;
  if(!observation||observation.matchId!==matchId||observation.device!==device||
     observation.context!=='formation'||observation.ownership!=='spatial_formation'||
     observation.frameId>frameId||observation.frameId<=(memory?.lastCapture??0)||
     !Number.isFinite(observation.capturedAt)||observation.capturedAt>now||now-observation.capturedAt>armyFreshMs)return memory;
  const next={matchId,device,lastCapture:observation.frameId,own:[],enemy:[]};
  for(const side of ['own','enemy']){
    const seen=new Map((memory?.[side]??[]).map(row=>[row.name,row]));
    const field=observation.sides?.[side];
    for(const group of field?.groups??[]){
      const name=canonical(group.name);
      if(!unitNames.has(name)||!(group.similarity>=.90))continue;
      const known=(side==='own'?knownOwn:knownEnemy).has(name)||seen.has(name);
      const good=(field.instances??[]).filter(instance=>instance.name===name&&instance.score>=.90&&!instance.poolConflict);
      if(!known){
        if(side==='own'||completeEnemyDeck)continue;
        const repeated=group.similarity>=.94&&(group.observedConsecutively>=2||good.length>=2);
        const corroborated=!group.poolConflict&&recentObservations.some(prior=>
          prior.context==='formation'&&prior.matchId===matchId&&prior.device===device&&prior.frameId<observation.frameId&&
          observation.capturedAt-prior.capturedAt>0&&observation.capturedAt-prior.capturedAt<=formationAgreementMs&&
          prior.sides.enemy.groups.some(row=>row.name===name&&!row.poolConflict&&row.similarity>=.90&&
            Math.max(row.similarity,group.similarity)>=.94));
        if(!repeated&&!corroborated)continue;
      }
      if(known&&group.poolConflict&&!(group.observedConsecutively>=2))continue;
      const minimum=Math.max(1,Math.min(group.visibleMinimum,good.length));
      if(minimum>(seen.get(name)?.minimum??0))seen.set(name,{name,minimum,capture:observation.frameId});
    }
    next[side]=[...seen.values()];
  }
  return next;
}

export function summarizeArmyStock(choices,observations){
  const stock=new Map(Array.from(choices??[]).filter(([,count])=>Number.isSafeInteger(count)&&count>0)
    .map(([name,count])=>[name,{name,count,source:'choices'}]));
  for(const {name,minimum} of observations??[]){
    if(minimum>(stock.get(name)?.count??0))stock.set(name,{name,count:minimum,source:'formation'});
  }
  return [...stock.values()];
}

export function armyPilotGate(metrics){
  const reasons=[];
  if(!metrics||metrics.images<30||metrics.matches<5)reasons.push('independent_coverage');
  if(metrics?.precision==null||metrics.precision<.95)reasons.push('type_precision');
  if(metrics?.recall==null||metrics.recall<.90)reasons.push('type_recall');
  if((metrics?.errors??1)>0)reasons.push('evaluation_errors');
  if(metrics?.latency?.p95==null||metrics.latency.p95>=1000)reasons.push('latency');
  const types=Object.entries(metrics?.types??{}).filter(([,r])=>r.tp+r.fn>0);
  if(types.length<3)reasons.push('type_coverage');
  if(types.some(([,r])=>r.precision==null||r.precision<.95||r.recall==null||r.recall<.90))reasons.push('weak_types');
  return {typeReady:reasons.length===0,countReady:false,formReady:false,reasons,liveAdviceEnabled:false};
}
