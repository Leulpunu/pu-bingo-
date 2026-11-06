import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BotContacts, createBotHandler, BOT_COMMANDS } from '../bot.js';

function fixture(production=false){const sent=[],stored=[];const handler=createBotHandler({appUrl:'https://example.com/',production,deposits:{list:async()=>[{user:'123',minor:10000,status:'approved'}]},contacts:{update:async(...args)=>stored.push(args)},send:async(method,payload)=>sent.push(payload)});const message=(text,extra={})=>handler({message:{chat:{type:'private',id:123},from:{id:123},text,...extra}});return {sent,stored,message,handler};}
test('start provides optional own-contact sharing, skip and play open test table',async()=>{
 const {sent,message,stored}=fixture();await message('/start');assert.equal(sent[0].reply_markup.keyboard[0][0].request_contact,true);assert.match(sent[0].text,/optional/);
 await message('/skip');assert.equal(sent[1].reply_markup.remove_keyboard,true);assert.equal(new URL(sent[2].reply_markup.inline_keyboard[0][0].web_app.url).searchParams.get('screen'),'play20');assert.equal(stored.length,0);
 await message('/play');assert.match(sent.at(-1).text,/Simulation only/);
});
test('other people’s contacts are rejected; own phone can be removed',async()=>{
 const {sent,message,stored}=fixture();await message('',{contact:{user_id:999,phone_number:'+251900000000'}});assert.equal(stored.length,0);
 await message('',{contact:{user_id:123,phone_number:'+251900000000'}});assert.equal(stored[0][0],'123');assert.match(sent.at(-2).text,/does not verify a payment/);
 await message('/forgetphone');assert.deepEqual(stored.at(-1),['123',null]);
});
test('deposits and balances are simulations; pasted receipts never credit funds',async()=>{
 const {sent,message}=fixture();await message('/deposit');assert.match(sent.at(-1).text,/Do not transfer money/);assert.equal(new URL(sent.at(-1).reply_markup.inline_keyboard[0][0].web_app.url).searchParams.get('screen'),'wallet');
 await message('/balance');assert.match(sent.at(-1).text,/100.00 test units/);
 await message('You have transferred ETB 100.00. Transaction ABC123.');assert.match(sent.at(-1).text,/do not verify payments/);
});
test('production opens free play, disables deposit instructions, and ignores group messages',async()=>{
 const {sent,message,handler}=fixture(true);await message('/play');assert.equal(new URL(sent.at(-1).reply_markup.inline_keyboard[0][0].web_app.url).searchParams.get('screen'),'home');await message('/deposit');assert.match(sent.at(-1).text,/not available/);
 const before=sent.length;await handler({message:{chat:{type:'group',id:42},from:{id:123},text:'/start'}});assert.equal(sent.length,before);
 assert.throws(()=>createBotHandler({appUrl:'http://example.com'}),/HTTPS/);
});
test('phone deletion persists without removing other phone records',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pu-contacts-'));try{const file=join(dir,'contacts.json'),store=new BotContacts(file);await Promise.all([store.update('a',{phone_number:'+251900000001'}),store.update('b',{phone_number:'+251900000002'})]);await store.update('a',null);const rows=JSON.parse(await readFile(file,'utf8'));assert.equal(rows.a,undefined);assert.equal(rows.b.phone,'+251900000002');}finally{await rm(dir,{recursive:true,force:true});}
});
test('command menu includes screenshot actions and game name changes require validation',async()=>{
 for(const name of ['play','balance','deposit','withdraw','change_username','agent','support'])assert.ok(BOT_COMMANDS.some(c=>c.command===name));
 const sent=[],renamed=[];const handle=createBotHandler({appUrl:'https://example.com',deposits:{list:async()=>[]},contacts:{},send:async(_,body)=>sent.push(body),support:'@pu_support',agentContact:'@pu_agents',rename:async(...args)=>renamed.push(args)});
 const message=text=>handle({message:{chat:{id:7,type:'private'},from:{id:7,first_name:'Player'},text}});
 await message('/change_username');await message('<invalid>');assert.equal(renamed.length,0);
 await message('New Player');assert.deepEqual(renamed[0],['7','New Player']);
 await message('/support');assert.match(sent.at(-1).text,/@pu_support/);
 await message('/agent');assert.match(sent.at(-1).text,/@pu_agents/);
 await message('/change_username Another Name');assert.equal(renamed[1][1],'Another Name');
 await message('/change_username');await message('/cancel');await message('Not a name change');assert.equal(renamed.length,2);
});
test('balance reply separates reserved funds and affordable cartelas',async()=>{
 const sent=[];const handle=createBotHandler({appUrl:'https://example.com',deposits:{list:async()=>[{user:'7',type:'deposit',minor:10000,status:'approved'},{user:'7',type:'withdrawal',minor:2500,status:'pending'}]},contacts:{},send:async(_,body)=>sent.push(body)});
 await handle({message:{chat:{id:7,type:'private'},from:{id:7},text:'/balance'}});
 assert.match(sent[0].text,/Available: 75.00/);assert.match(sent[0].text,/Reserved: 25.00/);assert.match(sent[0].text,/Cards you can buy: 3/);assert.ok(sent[0].reply_markup.inline_keyboard);
});
