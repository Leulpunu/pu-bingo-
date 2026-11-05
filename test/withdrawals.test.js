import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TestDeposits, balance } from '../deposits.js';
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'pu-withdraw-'));try{const store=new TestDeposits(join(dir,'ledger.json'));await store.transaction(rows=>rows.push({type:'deposit',user:'a',minor:10000,status:'approved'}));await fn(store);}finally{await rm(dir,{recursive:true,force:true});}}
test('withdrawal holds funds once; approved and paid states do not debit again',()=>fixture(async store=>{
 const key=randomUUID();const [a,b]=await Promise.all([store.withdraw('a','60','TEST-TELEBIRR',key),store.withdraw('a','60','TEST-TELEBIRR',key)]);assert.equal(a.id,b.id);assert.equal(balance(await store.list(),'a'),4000);
 await assert.rejects(()=>store.withdraw('a','61','TEST-TELEBIRR',key),/different details/);
 await assert.rejects(()=>store.reviewWithdrawal(a.id,'paid','admin','TEST-PAYOUT1'),/transition/);
 await store.reviewWithdrawal(a.id,'approved','admin');assert.equal(balance(await store.list(),'a'),4000);
 const paid=await store.reviewWithdrawal(a.id,'paid','admin','TEST-PAYOUT1');assert.equal(paid.events.length,2);
 await store.reviewWithdrawal(a.id,'paid','admin','TEST-PAYOUT1');assert.equal(balance(await store.list(),'a'),4000);
 await assert.rejects(()=>store.reviewWithdrawal(a.id,'rejected','admin','','changed mind'),/transition/);
}));
test('rejection releases a hold once and paid references cannot be reused',()=>fixture(async store=>{
 const row=await store.withdraw('a','20','TEST-RECIPIENT',randomUUID());await store.reviewWithdrawal(row.id,'approved','admin');await store.reviewWithdrawal(row.id,'rejected','admin','','Simulated failure');await store.reviewWithdrawal(row.id,'rejected','admin','','Simulated failure');assert.equal(balance(await store.list(),'a'),10000);
 const a=await store.withdraw('a','10','TEST-RECIPIENT',randomUUID()),b=await store.withdraw('a','10','TEST-RECIPIENT',randomUUID());
 await store.reviewWithdrawal(a.id,'approved','admin');await store.reviewWithdrawal(b.id,'approved','admin');await store.reviewWithdrawal(a.id,'paid','admin','TEST-UNIQUE1');await assert.rejects(()=>store.reviewWithdrawal(b.id,'paid','admin','TEST-UNIQUE1'),/already been used/);
}));
test('withdrawals and stakes share one balance and cannot overspend concurrently',()=>fixture(async store=>{
 const attempts=await Promise.allSettled([store.withdraw('a','90','TEST-TELEBIRR',randomUUID()),store.buy('a','round',1)]);assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.ok(balance(await store.list(),'a')>=0);
 assert.throws(()=>store.withdraw('a','-1','TEST-TELEBIRR',randomUUID()));assert.throws(()=>store.withdraw('a','1.001','TEST-TELEBIRR',randomUUID()));assert.throws(()=>store.withdraw('a','1','0912345678',randomUUID()));
}));
test('pending withdrawal survives recovery; simulated approval never credits a deposit',()=>fixture(async store=>{
 const row=await store.withdraw('a','25','TEST-TELEBIRR',randomUUID());await store.recover();const reloaded=new TestDeposits(store.file);assert.equal(balance(await reloaded.list(),'a'),7500);await assert.rejects(()=>store.review(row.id,'approved','admin'),/Deposit request not found/);assert.equal((await reloaded.list('a')).find(r=>r.id===row.id).status,'pending');
}));
