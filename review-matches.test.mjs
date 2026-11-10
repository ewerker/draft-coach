import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {reviewQueries,reviewSchema} from './review.mjs';

test('all archived matches including old entries without detailed logs can be reviewed',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('./data/archive-schema.sql',import.meta.url),'utf8'));db.exec(reviewSchema);
  try{
    const insert=db.prepare('INSERT INTO partien VALUES (?,?,?,?,?,?,?,?,?,?)');
    for(let i=0;i<205;i++)insert.run('match-'+i,'draft','draft','gewonnen',i,i+1,1,JSON.stringify([i+100]),'test','');
    const addDetails=db.prepare('INSERT INTO partie_protokoll VALUES (?,?)');
    addDetails.run('match-1',JSON.stringify({id:'match-1',mode:'draft',outcome:'gewonnen',started:1,ended:2,captureIds:[101],reviewFrames:[]}));
    db.prepare('INSERT INTO belege VALUES (?,?,?,?,?,?,?,?,?,?)').run(100,'match-0','test','test',null,1,1,'image/png','hash',Buffer.from('test'));
    const review=reviewQueries(async()=>[],(_read,fn)=>Promise.resolve(fn(db)),'nonexistent-test-runtime');
    const games=await review.matches();
    assert.equal(games.length,205);
    assert.equal(games.find(item=>item.id==='match-0').hasDetails,false);
    assert.equal(games.find(item=>item.id==='match-0').evidenceCount,1);
    assert.equal(games.find(item=>item.id==='match-1').hasDetails,true);
    const old=await review.match('match-0');
    assert.deepEqual(old.availableCaptureIds,[100]);
    assert.equal((await review.image(old,100)).toString(),'test');
    const missing=await review.match('match-1');
    assert.deepEqual(missing.availableCaptureIds,[]);
  }finally{db.close();}
});
