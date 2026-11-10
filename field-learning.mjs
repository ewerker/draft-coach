import {createHash} from 'node:crypto';

// A whole match belongs to one partition. Unlinked screenshots are never used
// in either partition: their independence cannot be established.
export function buildFieldEvaluation(references,imagePath,engineRevision=''){
  const linked=references.filter(r=>typeof r.matchId==='string'&&r.matchId.length>0);
  const matches=[...new Set(linked.map(r=>r.matchId))];
  // Stable partition: adding later matches never moves earlier matches into training.
  const testIds=new Set(matches.filter(id=>createHash('sha256').update(id).digest()[0]%4===0));
  const testCount=testIds.size;
  const training=linked.filter(r=>!testIds.has(r.matchId));
  const testing=linked.filter(r=>testIds.has(r.matchId));
  const examples=training.flatMap(r=>(r.corrections||[]).filter(c=>['own_field','enemy_field'].includes(c.phase)).map(c=>({...c,path:imagePath(r.id)})));
  const cases=testing.flatMap(r=>['own','enemy'].filter(side=>r.complete?.[side]===true).map(side=>({
    id:r.id,matchId:r.matchId,side,path:imagePath(r.id),truth:(r.corrections||[]).filter(c=>c.phase===side+'_field')
  })));
  const material=references.map(r=>({id:r.id,matchId:r.matchId,corrections:r.corrections,complete:r.complete})).sort((a,b)=>a.id.localeCompare(b.id));
  const fingerprint=createHash('sha256').update(JSON.stringify({schema:1,engineRevision,material})).digest('hex');
  return {examples,cases,fingerprint,inventory:{images:references.length,linkedImages:linked.length,unlinkedImages:references.length-linked.length,matches:matches.length,trainingMatches:matches.length-testCount,testMatches:testCount,
    ownMarked:references.filter(r=>(r.corrections||[]).some(c=>c.phase==='own_field')).length,
    enemyMarked:references.filter(r=>(r.corrections||[]).some(c=>c.phase==='enemy_field')).length,
    ownComplete:references.filter(r=>r.complete?.own).length,enemyComplete:references.filter(r=>r.complete?.enemy).length}};
}

export function fieldReadiness(metrics){
  if(!metrics)return {state:'collecting',ready:false};
  const ready=metrics.images>=30&&metrics.matches>=5&&Object.values(metrics.types||{}).filter(t=>t.tp+t.fn>0).length>=3&&metrics.precision!==null&&metrics.precision>=.95&&metrics.recall!==null&&metrics.recall>=.90&&metrics.errors===0;
  return {state:ready?'observation_ready':'collecting',ready};
}
