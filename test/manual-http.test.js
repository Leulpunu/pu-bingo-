import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHmac } from 'node:crypto';

test('manual deposit API requires verified accounts and allowlisted administrators; credit survives restart',{timeout:15000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pu-manual-api-'));const adminKey='private_test_admin_key_012345678901234567890';let child,base;
 const accounts=['+251900000001','+251900000002','+251900000003'].map((phone,i)=>({phone,name:'Holder '+i}));
 async function start(){child=spawn(process.execPath,[fileURLToPath(new URL('../server.js',import.meta.url))],{cwd:dir,env:{...process.env,PORT:'0',NODE_ENV:'development',BOT_TOKEN:'test-token',BOT_POLLING:'false',BOT_WEBHOOK_SECRET:'',MANUAL_DEPOSITS_ENABLED:'true',MANUAL_ADMIN_IDS:'999',MANUAL_ADMIN_KEY:adminKey,MANUAL_TELEBIRR_ACCOUNTS_FILE:'',MANUAL_TELEBIRR_ACCOUNTS:JSON.stringify(accounts)},stdio:['ignore','pipe','pipe']});let output='';await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',()=>reject(Error('Server exited')));child.stdout.on('data',data=>{output+=data;if(/http:\/\/localhost:\d+/.test(output)){base=output.match(/http:\/\/localhost:\d+/)[0];resolve();}});});}
 async function stop(){const done=once(child,'exit');child.kill();await done;child=null;}
 async function call(path,token,body,key){const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...(key?{'X-Manual-Admin-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
 async function login(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Player'})});const data=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update('test-token').digest()).update(data).digest('hex'));return (await call('auth',null,{initData:p.toString()})).data;}
 try{
  await start();let player=await login(123),admin=await login(999),outsider=await login(456);assert.equal(player.manualDeposits,true);assert.equal(admin.manualAdmin,true);
  const guest=(await call('auth',null,{})).data;assert.equal((await call('manual/wallet',guest.token)).status,403);
  assert.equal((await call('manual/wallet')).status,401);
  const created=await call('manual/deposits',player.token,{amount:'120.50',requestKey:randomUUID()});assert.equal(created.status,201);assert.equal(created.data.status,'awaiting_reference');
  assert.equal((await call('manual/deposits/'+created.data.id+'/reference',outsider.token,{reference:'TRANSACT123'})).status,409);
  const pending=(await call('manual/deposits/'+created.data.id+'/reference',player.token,{reference:'TRANSACT123'})).data;assert.equal((await call('manual/wallet',player.token)).data.balanceMinor,0);
  assert.equal((await call('manual/admin/deposits',admin.token)).status,403);assert.equal((await call('manual/admin/deposits',outsider.token,undefined,adminKey)).status,403);
  const body={decision:'approved',proof:{received:true,amount:'120.50',phone:pending.phone,reference:pending.reference}};
  assert.equal((await call('manual/admin/deposits/'+pending.id+'/review',player.token,body,adminKey)).status,403);
  assert.equal((await call('manual/admin/deposits/'+pending.id+'/review',admin.token,body,adminKey)).status,200);
  assert.equal((await call('manual/admin/deposits/'+pending.id+'/review',admin.token,body,adminKey)).status,200);
  assert.equal((await call('manual/wallet',player.token)).data.balanceMinor,12050);assert.equal((await call('test-wallet',player.token)).data.balanceMinor,0);
  assert.equal((await call('manual/wallet',outsider.token)).data.deposits.length,0);
  assert.equal((await fetch(base+'/data/manual-payments.sqlite')).status,404);
  await stop();await start();player=await login(123);const wallet=(await call('manual/wallet',player.token)).data;assert.equal(wallet.balanceMinor,12050);assert.equal(wallet.spendingEnabled,false);assert.equal(wallet.withdrawalsEnabled,false);
 }finally{if(child)await stop();await rm(dir,{recursive:true,force:true});}
});
