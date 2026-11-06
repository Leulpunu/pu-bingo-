import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramWebhook } from '../telegram-webhook.js';
const secret='test_webhook_secret_01234567890123456789';
test('webhook rejects unauthorized and malformed updates before executing commands',async()=>{
 let handled=0;const hook=new TelegramWebhook(secret,async()=>handled++);
 await assert.rejects(()=>hook.deliver('wrong',{update_id:1}),e=>e.status===401);
 await assert.rejects(()=>hook.deliver(secret,{update_id:'1'}),e=>e.status===400);
 assert.equal(handled,0);assert.throws(()=>new TelegramWebhook('short',async()=>{}));
});
test('concurrent webhook deliveries run once and failed deliveries can retry',async()=>{
 let handled=0;const hook=new TelegramWebhook(secret,async()=>{handled++;});
 const result=await Promise.all([hook.deliver(secret,{update_id:10}),hook.deliver(secret,{update_id:10})]);assert.equal(handled,1);assert.equal(result[1].duplicate,true);
 let attempts=0;const retry=new TelegramWebhook(secret,async()=>{if(++attempts===1)throw Error('temporary failure');});
 await assert.rejects(()=>retry.deliver(secret,{update_id:11}));await retry.deliver(secret,{update_id:11});assert.equal(attempts,2);
});
