import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { balance } from './deposits.js';

export class BotContacts {
  constructor(file='data/bot-contacts.json'){this.file=file;this.queue=Promise.resolve();}
  update(id, contact){const run=this.queue.then(async()=>{let rows={};try{rows=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(contact)rows[id]={phone:contact.phone_number,updatedAt:new Date().toISOString()};else delete rows[id];await mkdir(dirname(this.file),{recursive:true});await writeFile(this.file+'.tmp',JSON.stringify(rows));await rename(this.file+'.tmp',this.file);});this.queue=run.catch(()=>{});return run;}
}

export function createBotHandler({appUrl,production=false,deposits,contacts,send,support=''}) {
  const url=new URL(appUrl);
  if(url.protocol!=='https:'||url.username||url.password)throw Error('MINI_APP_URL must be a public HTTPS URL without credentials.');
  const launch=screen=>{const link=new URL(url);link.searchParams.set('screen',screen);return link.href;};
  const button=(text,screen)=>({inline_keyboard:[[{text,web_app:{url:launch(screen)}}]]});
  const playText=production?'Open PU Bingo to play a free round.':'Choose your cartela in the 20-unit test game. Winner: 80%. House: 20%. Simulation only; no real ETB.';
  return async update=>{
    const message=update.message;
    if(!message||message.chat?.type!=='private'||!message.from?.id)return;
    const id=String(message.from.id),chat=message.chat.id;
    const reply=(text,reply_markup)=>send('sendMessage',{chat_id:chat,text,...(reply_markup?{reply_markup}:{})});
    if(message.contact){
      if(message.contact.user_id!==message.from.id)return reply('Please share only your own contact using the Share my phone button. You may also use /skip.');
      if(!/^\+?\d{7,15}$/.test(message.contact.phone_number))return reply('This phone format is not supported. Use /skip to continue without it.');
      await contacts.update(id,message.contact);
      await reply('Thank you! Your phone number is saved for your registration record. Use /forgetphone to remove it. It does not verify a payment or ownership of a Telebirr account.',{remove_keyboard:true});
      return reply(playText,button(production?'Play free bingo':'Play 20 — TEST ONLY',production?'home':'play20'));
    }
    const command=String(message.text||'').split(/\s/)[0].split('@')[0].toLowerCase();
    switch(command){
      case '/start':return reply('Welcome to PU Bingo! You can optionally share your phone for your registration record, or use /skip to continue without it. We store it on our server until you use /forgetphone or request removal. It is not needed to play. Read /privacy before sharing. Never send PINs, passwords, or sign-in codes.',{keyboard:[[{text:'Share my phone',request_contact:true}],[{text:'/skip'}]],resize_keyboard:true,one_time_keyboard:true});
      case '/skip':await reply('Continue without sharing a phone number.',{remove_keyboard:true});return reply(playText,button(production?'Play free bingo':'Play 20 — TEST ONLY',production?'home':'play20'));
      case '/play':return reply(playText,button(production?'Play free bingo':'Play 20 — TEST ONLY',production?'home':'play20'));
      case '/deposit':return production?reply('Real deposits are not available. Do not send money to any account for this version.'):reply('TEST DEPOSITS ONLY. No Telebirr account is connected. Open the test wallet, enter a fictional amount and TEST reference, then wait for administrator review. Do not transfer money or paste real SMS receipts.',button('Open test wallet','wallet'));
      case '/withdraw':return production?reply('Real withdrawals are not available.'):reply('SIMULATED WITHDRAWALS ONLY. Open the test wallet and enter a fictional amount and TEST recipient label. The amount is reserved until administrator review. No real Telebirr payment is made.',button('Open test wallet','wallet'));
      case '/balance':return production?reply('This version has no real-money wallet.'):reply('Simulation balance: '+(balance(await deposits.list(id),id)/100).toFixed(2)+' test units. Not cash; cannot be withdrawn.');
      case '/rules':return reply('Choose a cartela in 30 seconds. A number is called every 4 seconds. Complete two distinct lines on the same cartela (rows, columns, or diagonals) and claim BINGO. In test-stake rooms, buy one or more cards for 20 test units each per round. At least 2 paid players are needed; winner gets 80%, house 20%. No winner or an interrupted game means stakes are refunded.',button('Read rules and privacy','rules'));
      case '/privacy':return reply('PU Bingo is independent of Telegram. The game stores your Telegram ID, first name, statistics, and simulated transactions. If you share your phone with this bot, it is stored separately for registration; /forgetphone removes that stored phone. Messages you send also remain in your Telegram chat unless you delete them. Avoid sending real payment details.',button('Rules & Privacy','rules'));
      case '/forgetphone':await contacts.update(id,null);return reply('Your phone record has been removed from PU Bingo. This does not delete the original contact message in Telegram; you can delete it from the chat.');
      case '/help':return reply('/play — Open bingo\n/deposit — Test deposit instructions\n/balance — Test wallet balance\n/rules — How to play\n/privacy — Data information\n/forgetphone — Remove stored phone\n/skip — Continue without phone'+(support?'\nSupport: '+support:'\nA dedicated support contact has not been configured.'));
      default:return reply('Use /play to open the game or /help for commands. Pasted SMS receipts do not verify payments or credit your balance.');
    }
  };
}

export async function startBot({token,appUrl,production,deposits,support}){
  if(!token)throw Error('BOT_TOKEN is required when BOT_POLLING=true.');
  const send=async(method,payload)=>{
    let response;
    try{response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)});}catch{throw Error('Telegram connection failed.');}
    const data=await response.json();if(!data.ok)throw Error('Telegram API request failed ('+response.status+').');return data.result;
  };
  const handle=createBotHandler({appUrl,production,deposits,contacts:new BotContacts(),send,support});
  const webhook=await send('getWebhookInfo',{});
  if(webhook.url)throw Error('This bot already uses a webhook. Choose one update method before enabling polling.');
  let offset=0;
  try{offset=Number(await readFile('data/bot-offset.txt','utf8'))||0;}catch(e){if(e.code!=='ENOENT')throw e;}
  const controller=new AbortController();
  const loop=async()=>{while(!controller.signal.aborted){try{
    const updates=await send('getUpdates',{offset,timeout:20,allowed_updates:['message']});
    for(const update of updates){if(controller.signal.aborted)break;await handle(update);offset=update.update_id+1;await mkdir('data',{recursive:true});await writeFile('data/bot-offset.tmp',String(offset));await rename('data/bot-offset.tmp','data/bot-offset.txt');}
  }catch{console.error('Bot update failed; retrying without logging message content or credentials.');await new Promise(r=>setTimeout(r,3000));}}};
  void loop();return ()=>controller.abort();
}
