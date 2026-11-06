import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
test('hosted webhook is reachable without a player session but requires its own secret',{timeout:10000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pu-hook-http-')),secret='webhook_test_secret_01234567890123456789';let child;
 try{
  child=spawn(process.execPath,[fileURLToPath(new URL('../server.js',import.meta.url))],{cwd:dir,env:{...process.env,PORT:'0',BOT_POLLING:'false',NODE_ENV:'production',BOT_TOKEN:'test-token',MINI_APP_URL:'https://example.com',BOT_WEBHOOK_SECRET:secret},stdio:['ignore','pipe','pipe']});
  const [output]=await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server startup failed');})]);
  const base=String(output).match(/http:\/\/localhost:\d+/)[0];
  const readiness=await fetch(base+'/api/telegram/webhook');assert.equal((await readiness.json()).enabled,true);
  const post=key=>fetch(base+'/api/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'X-Telegram-Bot-Api-Secret-Token':key}:{})},body:JSON.stringify({update_id:5,message:{chat:{type:'group'},from:{id:123},text:'/play'}})});
  assert.equal((await post()).status,401);assert.equal((await post('wrong')).status,401);
  assert.equal((await post(secret)).status,200);assert.equal((await (await post(secret)).json()).duplicate,true);
  assert.equal((await fetch(base+'/api/profile')).status,401);
 }finally{if(child){const ended=once(child,'exit');child.kill();await ended;}await rm(dir,{recursive:true,force:true});}
});
