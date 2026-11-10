export class LatestQueue {
  constructor(run, publish, failure) { Object.assign(this,{run,publish,failure}); this.pending=null; this.running=false; this.latest=0; }
  supersede(id) { this.latest=Math.max(this.latest,id); }
  push(job) { this.supersede(job.id); if(job.id<this.latest)return; this.pending=job; void this.drain(); }
  async drain() {
    if(this.running)return;
    this.running=true;
    try {
      while(this.pending) {
        const job=this.pending; this.pending=null;
        try { const result=await this.run(job); if(job.id===this.latest)this.publish(job,result); }
        catch(e) { if(job.id===this.latest)this.failure(job,e); }
      }
    } finally { this.running=false; }
  }
}

export function autoCaptureBusy({autoBusy,capturing,manualTapPending,recognizing,queueRunning}) {
  return !!(autoBusy||capturing||manualTapPending||recognizing||queueRunning);
}

export function nextLossStreak(count,outcome) {
  if(outcome==='verloren')return count+1;
  if(outcome==='gewonnen')return 0;
  return count;
}

// An event adds evidence without erasing a previously observed lineup slot.
export function mergeEnemyEvent(card,event) {
  const {box,position,...facts}=event;
  const reinforced=facts.reinforcedSeen===true||card?.name===event.name&&card.reinforcedSeen===true||['upgrade','multiply','multiply_upgrade'].includes(event.action);
  return {...(card||{}),...facts,...(reinforced?{reinforcedSeen:true}:{})};
}
export function preferEnemyDeckCard(previous,candidate) {
  if(!candidate?.name)return false;
  if(!previous?.name)return true;
  const rank=card=>card.nameSource==='opponent-deck-caption'?1:0;
  return rank(candidate)>rank(previous)||(rank(candidate)===rank(previous)&&(candidate.similarity??0)>(previous.similarity??0));
}
