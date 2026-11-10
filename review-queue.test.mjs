import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {reviewQueries,reviewSchema} from './review.mjs';

test('all review cases remain in the shared queue and the work status persists independently of rule state',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(reviewSchema);
  try{
    const insert=db.prepare('INSERT INTO review_cases VALUES (?,?,?,?,?,?)');
    for(let i=0;i<105;i++)insert.run('case-'+i,'match-1',i,i,JSON.stringify({observation:'note',rule:null}),null);
    const review=reviewQueries(async()=>[],(_read,fn)=>Promise.resolve(fn(db)),'unused');
    assert.equal((await review.list()).length,105);
    await review.setReviewed('case-0',true);
    assert.equal((await review.list()).find(item=>item.id==='case-0').reviewed,true);
    await review.setReviewed('case-0',false);
    assert.equal((await review.list()).find(item=>item.id==='case-0').reviewed,false);
    await assert.rejects(review.setReviewed('missing',true));
  }finally{db.close();}
});
