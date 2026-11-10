import {createHash} from 'node:crypto';
import {fieldPartition} from './image-review.mjs';

function sideTruth(ref,side,training=false){
 const confirmation=ref.fieldConfirmations?.[side];
 if(confirmation)return confirmation.groups.filter(g=>g.typeConfirmed&&(!training||g.box)).map((g,i)=>({
   name:g.name,phase:side+'_field',position:i,box:g.box,count:g.count??null,stage:null,confirmedForms:g.forms??[]
 }));
 return (ref.corrections??[]).filter(c=>c.phase===side+'_field');
}
const completeSide=(ref,side)=>ref.fieldConfirmations?.[side]?.typesComplete??ref.complete?.[side]===true;

// A whole match belongs to one partition. Unlinked screenshots are never used
// in either partition: their independence cannot be established.
export function buildFieldEvaluation(references,imagePath,engineRevision=''){
  const linked=references.filter(r=>typeof r.matchId==='string'&&r.matchId.length>0);
  const matches=[...new Set(linked.map(r=>r.matchId))];
  // Stable partition: adding later matches never moves earlier matches into training.
  const testIds=new Set(matches.filter(id=>fieldPartition(id)==='test'));
  const testCount=testIds.size;
  // A byte-identical screenshot in a second match cannot cross the holdout boundary.
  const testHashes=new Set(linked.filter(r=>testIds.has(r.matchId)&&r.imageHash).map(r=>r.imageHash));
  const training=linked.filter(r=>!testIds.has(r.matchId)&&(!r.imageHash||!testHashes.has(r.imageHash)));
  const testing=linked.filter(r=>testIds.has(r.matchId)&&r.reviewAssisted!==true);
  const examples=training.flatMap(r=>['own','enemy'].flatMap(side=>sideTruth(r,side,true)).map(c=>({...c,path:imagePath(r.id),referenceId:r.id,matchId:r.matchId,language:r.language??'unknown'})));
  const cases=testing.flatMap(r=>['own','enemy'].filter(side=>completeSide(r,side)).map(side=>({
    id:r.id,matchId:r.matchId,side,path:imagePath(r.id),language:r.language??'unknown',phase:r.phase??'unknown',reviewPurpose:r.reviewPurpose??'legacy',truth:sideTruth(r,side)
  })));
  const material=references.map(r=>({id:r.id,matchId:r.matchId,corrections:r.corrections,complete:r.complete,fieldConfirmations:r.fieldConfirmations,imageHash:r.imageHash,reviewPurpose:r.reviewPurpose,reviewAssisted:r.reviewAssisted})).sort((a,b)=>a.id.localeCompare(b.id));
  const fingerprint=createHash('sha256').update(JSON.stringify({schema:1,engineRevision,material})).digest('hex');
  return {examples,cases,fingerprint,inventory:{images:references.length,linkedImages:linked.length,unlinkedImages:references.length-linked.length,matches:matches.length,trainingMatches:matches.length-testCount,testMatches:testCount,
    ownMarked:references.filter(r=>sideTruth(r,'own').length).length,
    enemyMarked:references.filter(r=>sideTruth(r,'enemy').length).length,
    ownComplete:references.filter(r=>completeSide(r,'own')).length,enemyComplete:references.filter(r=>completeSide(r,'enemy')).length}};
}

export function fieldReadiness(metrics){
  if(!metrics)return {state:'collecting',ready:false};
  const ready=metrics.images>=30&&metrics.matches>=5&&Object.values(metrics.types||{}).filter(t=>t.tp+t.fn>0).length>=3&&metrics.precision!==null&&metrics.precision>=.95&&metrics.recall!==null&&metrics.recall>=.90&&metrics.errors===0;
  return {state:ready?'observation_ready':'collecting',ready};
}
