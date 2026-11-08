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
