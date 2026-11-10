import test from 'node:test';
import assert from 'node:assert/strict';
import {ruleEvidence} from './learning.mjs';

test('counts only actual sent choices, once per match and rule',()=>{
  const rules=[{id:'r1',title:'Rule one'},{id:'r2',title:'Rule two'}];
  const frame=id=>({id,advice:{evaluated:[{index:0,name:'A',rules:[{id:'r1',title:'Rule one'}]},{index:1,name:'B',rules:[{id:'r2',title:'Rule two'}]}]}});
  const games=[{id:'g1',started:1000,ended:9000,outcome:'gewonnen',reviewFrames:[frame(11),frame(12)]},{id:'g2',started:1000,ended:9000,outcome:'verloren',reviewFrames:[frame(13)]}];
  const click=(id,name,pos,ergebnis='gesendet')=>({partie:id===13?'g2':'g1',aufnahme:id,zeit:new Date(5000).toISOString(),karte:name,position:pos,ergebnis});
  const rows=ruleEvidence(games,[click(11,'A',1),click(11,'A',1),click(12,'A',1),click(13,'B',2),click(13,'A',1,'fehler')],rules);
  assert.deepEqual([rows[0].wins,rows[0].losses,rows[0].decisions],[1,0,2]);
  assert.deepEqual([rows[1].wins,rows[1].losses,rows[1].decisions],[0,1,1]);
});
test('does not attribute ambiguous old titles or unrelated clicks',()=>{
  const games=[{id:'g',started:1000,ended:9000,outcome:'gewonnen',reviewFrames:[{id:10,advice:{evaluated:[{index:0,name:'A',rules:[{title:'Same'}]}]}}]}];
  const clicks=[{aufnahme:10,zeit:new Date(5000).toISOString(),karte:'A',position:1,ergebnis:'gesendet'}];
  const rows=ruleEvidence(games,clicks,[{id:'a',title:'Same'},{id:'b',title:'Same'}]);
  assert.equal(rows[0].wins+rows[1].wins,0);
});
test('suggestions remain descriptive and require multiple separate matches',()=>{
  const rule={id:'r',title:'Rule'};
  const games=[0,1,2].map((i)=>({id:'g'+i,started:1000,ended:9000,outcome:i===0?'gewonnen':'verloren',reviewFrames:[{id:20+i,advice:{evaluated:[{index:0,name:'A',rules:[{id:'r'}]}]}}]}));
  const clicks=games.map((game,i)=>({partie:game.id,aufnahme:20+i,zeit:new Date(5000).toISOString(),karte:'A',position:1,ergebnis:'gesendet'}));
  assert.equal(ruleEvidence(games.slice(0,2),clicks,[rule])[0].signal,'insufficient');
  assert.equal(ruleEvidence(games,clicks,[rule])[0].signal,'review');
});
