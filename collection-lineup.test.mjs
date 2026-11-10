import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionLineup} from './collection-lineup.mjs';
const cards=(names,score=.95)=>names.map((name,x)=>({name,x,score}));
test('only a complete confident collection header replaces a saved lineup',()=>{
  const previous=['A','B','C','D'];
  assert.deepEqual(collectionLineup([{kind:'units',lineup:cards(['E','F','G'])}],'units',previous,4).chosen,previous);
  assert.deepEqual(collectionLineup([{kind:'units',lineup:cards(['E','F','G','H'],.79)}],'units',previous,4).chosen,previous);
  assert.deepEqual(collectionLineup([{kind:'units',lineup:cards(['E','F','G','H'])}],'units',previous,4).chosen,['E','F','G','H']);
  assert.deepEqual(collectionLineup([{kind:'deck-units',lineup:cards(['E','F','G','H'])}],'units',previous,4).chosen,previous);
});
test('newest complete header wins and disagreements are flagged',()=>{
  const images=[{kind:'spells',lineup:cards(['A','B','C'])},{kind:'spells',lineup:cards(['A','B','D'])}];
  const result=collectionLineup(images,'spells',[],3);
  assert.deepEqual(result.chosen,['A','B','D']);
  assert.equal(result.conflict,true);
});
