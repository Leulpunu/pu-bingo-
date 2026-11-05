import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestDeposits, balance, prizeSplit } from '../deposits.js';

async function fixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),'pu-stakes-'));
  try { await fn(new TestDeposits(join(dir,'ledger.json'))); }
  finally { await rm(dir,{recursive:true,force:true}); }
}
const fund=(store,users,minor=2000)=>store.transaction(rows=>{for(const user of users)rows.push({type:'deposit',user,minor,status:'approved'});});
test('every cartela count uses 20 entry, 80% prize, 20% house',()=>{
  for(let n=0;n<=450;n++)assert.deepEqual(prizeSplit(n),{totalMinor:n*2000,prizeMinor:n*1600,houseMinor:n*400});
  assert.deepEqual(prizeSplit(450),{totalMinor:900000,prizeMinor:720000,houseMinor:180000});
  assert.throws(()=>prizeSplit(451));
  assert.deepEqual(prizeSplit(91),{totalMinor:182000,prizeMinor:145600,houseMinor:36400});
});
test('concurrent duplicate purchases deduct once and insufficient funds cannot overspend',()=>fixture(async store=>{
  await fund(store,['a']);
  await Promise.all([store.buy('a','round1',1),store.buy('a','round1',1)]);
  assert.equal(balance(await store.list(),'a'),0);
  await assert.rejects(()=>store.buy('a','round2',1),/Not enough/);
  await assert.rejects(()=>store.buy('a','round1',2),/Not enough/);
  await fund(store,['b']);await assert.rejects(()=>store.buy('b','round1',1),/already purchased/);
  assert.equal(balance(await store.list(),'b'),2000);
}));
test('91 paid cards settle atomically with one prize and one house credit',()=>fixture(async store=>{
  const users=Array.from({length:91},(_,i)=>'p'+i);await fund(store,users);
  await Promise.all(users.map((u,i)=>store.buy(u,'round',i+1)));
  const [a,b]=await Promise.all([store.settle('round','p0'),store.settle('round','p0')]);assert.equal(a.id,b.id);
  const rows=await store.list();assert.equal(balance(rows,'p0'),145600);assert.equal(balance(rows,'@house'),36400);
  assert.equal(rows.filter(r=>r.type==='prize').length,1);assert.equal(rows.filter(r=>r.type==='house').length,1);
  assert.equal(users.reduce((sum,u)=>sum+balance(rows,u),balance(rows,'@house')),182000);
  await assert.rejects(()=>store.buy('p1','round',92),/already settled/);
}));
test('no-winner and restart refund every stake once without house earnings',()=>fixture(async store=>{
  await fund(store,['a','b'],4000);await store.buy('a','no-winner',1);await store.buy('b','restart',2);
  await store.settle('no-winner');await store.recover();await store.recover();
  const rows=await store.list();assert.equal(balance(rows,'a'),4000);assert.equal(balance(rows,'b'),4000);assert.equal(balance(rows,'@house'),0);
  assert.equal(rows.filter(r=>r.type==='refund').length,2);
  await assert.rejects(()=>store.settle('unknown','outsider'),/no paid/);
}));
test('multiple cards charge separately, duplicates do not, and each stake refunds once',()=>fixture(async store=>{
  await fund(store,['a','b'],10000);
  await Promise.all([store.buy('a','multi',1),store.buy('a','multi',2),store.buy('a','multi',3),store.buy('a','multi',3)]);
  let rows=await store.list();assert.equal(balance(rows,'a'),4000);assert.equal(rows.filter(r=>r.type==='stake').length,3);
  await assert.rejects(()=>store.buy('b','multi',2),/already purchased/);
  await store.buy('b','multi',4);const settled=await store.settle('multi','a');assert.equal(settled.prizeMinor,6400);assert.equal(settled.houseMinor,1600);
  rows=await store.list();assert.equal(balance(rows,'a'),10400);assert.equal(balance(rows,'b'),8000);
  await store.buy('b','refund-multi',5);await store.buy('b','refund-multi',6);await store.settle('refund-multi');await store.settle('refund-multi');assert.equal(balance(await store.list(),'b'),8000);
}));
