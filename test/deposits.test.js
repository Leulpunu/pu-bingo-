import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestDeposits } from '../deposits.js';
test('test deposits validate amounts, isolate users, and approve only once under concurrency',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pu-deposits-'));try{
 const store=new TestDeposits(join(dir,'store.json'));
 for(const amount of ['0','-1','1.001','Infinity','10001'])assert.throws(()=>store.submit('a',amount,'TEST-ABC123'));
 assert.throws(()=>store.submit('a','10','REALREF'));
 const row=await store.submit('a','12.34','TEST-ABC123');assert.equal(row.minor,1234);
 assert.equal((await store.list('b')).length,0);
 await assert.rejects(()=>store.submit('b','12.34','test-abc123'));
 const results=await Promise.allSettled([store.review(row.id,'approved','admin'),store.review(row.id,'approved','admin')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const persisted=await new TestDeposits(join(dir,'store.json')).list('a');assert.equal(persisted.length,1);assert.equal(persisted[0].status,'approved');assert.equal(persisted[0].reviewer,'admin');
 const rejected=await store.submit('a','5','TEST-REJECT1');await store.review(rejected.id,'rejected','admin');assert.equal((await store.list('a')).filter(d=>d.status==='approved').reduce((s,d)=>s+d.minor,0),1234);
 }finally{await rm(dir,{recursive:true,force:true});}
});
