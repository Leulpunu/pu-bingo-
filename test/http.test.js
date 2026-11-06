import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';

test('HTTP: deposits, paid entry, automatic start, single-player refund, restart recovery, production lock', {timeout:60000}, async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pu-http-')),key=randomBytes(32).toString('hex');let child,base;
 async function start(production=false){
  child=spawn(process.execPath,[fileURLToPath(new URL('../server.js',import.meta.url))],{cwd:dir,env:{...process.env,PORT:'0',MANUAL_DEPOSITS_ENABLED:'false',BOT_POLLING:'false',BOT_WEBHOOK_SECRET:'',TEST_ADMIN_KEY:key,NODE_ENV:production?'production':'development',BOT_TOKEN:'test-token'},stdio:['ignore','pipe','pipe']});
  const output=await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server startup failed');})]);
  base=String(output[0]).trim().match(/http:\/\/localhost:\d+/)[0]+'/api/';
 }
 async function stop(){const exited=once(child,'exit');child.kill();await exited;child=null;}
 async function call(path,token,body,admin=false){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...(admin?{'X-Test-Admin-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
 const guests=[randomUUID(),randomUUID(),randomUUID()];
 try{
  await start();const tokens=[];
  for(let i=0;i<3;i++){
   const auth=await call('auth',null,{guest:guests[i]});tokens.push(auth.data.token);
   const request=await call('test-deposits',tokens[i],{amount:'100',reference:'TEST-HTTP00'+i});assert.equal(request.status,201);
   assert.equal((await call('test-admin/review',tokens[i],{id:request.data.id,decision:'approved'})).status,403);
   assert.equal((await call('test-admin/review',tokens[i],{id:request.data.id,decision:'approved'},true)).status,200);
  }
  const [a,b,c]=tokens;
  let room=(await call('test-table',a,{})).data;
  assert.equal((await call('test-table',b,{})).data.id,room.id);
  assert.equal((await call(`rooms/${room.id}/join`,b,{})).status,200);
  assert.equal((await call(`rooms/${room.id}/card`,a,{cardId:450})).data.cardId,450);
  assert.equal((await call(`rooms/${room.id}/buy`,a,{})).data.paid,true);
  assert.equal((await call(`rooms/${room.id}/buy`,a,{})).status,200);
  assert.equal((await call('test-wallet',a)).data.balanceMinor,8000);
  assert.equal((await call(`rooms/${room.id}/card`,a,{cardId:50})).status,200);
  assert.equal((await call(`rooms/${room.id}/buy`,a,{})).status,200);
  assert.equal((await call('test-wallet',a)).data.balanceMinor,6000);
  const paid=(await call(`rooms/${room.id}/buy`,b,{})).data;
  assert.equal(paid.paidCount,3);assert.equal(paid.prizeMinor,4800);assert.equal(paid.houseMinor,1200);
  assert.equal((await call(`rooms/${room.id}/start`,a,{})).status,409);
  const solo=(await call('rooms',c,{staked:true})).data;await call(`rooms/${solo.id}/buy`,c,{});
  await new Promise(resolve=>setTimeout(resolve,31500));
  room=(await call(`rooms/${room.id}`,a)).data;assert.equal(room.status,'playing');assert.ok(room.drawn.length>0);
  assert.equal((await call(`rooms/${room.id}/buy`,a,{})).status,409);
  assert.equal((await call(`rooms/${room.id}/claim`,a,{})).status,409);
  const refunded=(await call(`rooms/${solo.id}`,c)).data;assert.equal(refunded.status,'finished');assert.equal(refunded.settlement.reason,'not-enough-players');
  assert.equal((await call('test-wallet',c)).data.balanceMinor,10000);
  await stop();await start();
  for(const guest of guests){const auth=await call('auth',null,{guest});assert.equal((await call('test-wallet',auth.data.token)).data.balanceMinor,10000);}
  const wa=(await call('auth',null,{guest:guests[0]})).data.token;
  const withdrawal=await call('test-withdrawals',wa,{amount:'25',recipient:'TEST-TELEBIRR',requestKey:randomUUID()});assert.equal(withdrawal.status,201);
  let wallet=(await call('test-wallet',wa)).data;assert.equal(wallet.balanceMinor,7500);assert.equal(wallet.reservedMinor,2500);
  assert.equal((await call('test-admin/withdrawals',wa)).status,403);
  assert.equal((await call('test-admin/withdrawals/review',wa,{id:withdrawal.data.id,decision:'approved'})).status,403);
  assert.equal((await call('test-admin/withdrawals/review',wa,{id:withdrawal.data.id,decision:'approved'},true)).status,200);
  assert.equal((await call('test-admin/withdrawals/review',wa,{id:withdrawal.data.id,decision:'paid',reference:'TEST-HTTPPAYOUT'},true)).status,200);
  wallet=(await call('test-wallet',wa)).data;assert.equal(wallet.balanceMinor,7500);assert.equal(wallet.reservedMinor,0);assert.equal(wallet.withdrawals[0].status,'paid');
  await stop();await start(true);
  assert.equal((await call('auth',null,{})).status,401);
  const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123,first_name:'Test'})});
  const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update('test-token').digest()).update(check).digest('hex'));
  const auth=await call('auth',null,{initData:p.toString()});assert.equal(auth.status,200);
  assert.equal((await call('test-wallet',auth.data.token)).status,403);
  assert.equal((await call('rooms',auth.data.token,{staked:true})).status,403);
 }finally{if(child)await stop();await rm(dir,{recursive:true,force:true});}
});
