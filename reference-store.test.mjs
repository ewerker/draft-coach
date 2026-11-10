import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createReferenceStore} from './reference-store.mjs';
test('references and corrections persist across store restarts and can be removed',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'coach-references-'));
  try{
    let store=await createReferenceStore(root);
    const ref=await store.add(Buffer.from('image'),{source:'automatic',phase:'battle_choice',issues:[{position:0}]});
    await store.correct(ref.id,{phase:'battle_choice',position:0,name:'Agent B',box:[1,2,3,4]});
    store=await createReferenceStore(root);
    assert.equal((await store.list())[0].corrections[0].name,'Agent B');
    assert.equal((await readFile(store.image(ref.id))).toString(),'image');
    await store.remove(ref.id);assert.deepEqual(await store.list(),[]);
    await assert.rejects(store.remove('../secret'));
  }finally{await rm(root,{recursive:true,force:true});}
});
