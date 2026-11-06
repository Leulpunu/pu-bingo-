import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { balance } from './deposits.js';

export const BOT_COMMANDS = [
  {command:'play',description:'Play | ተጫወት'},
  {command:'balance',description:'Balance | ቀሪ ሂሳብ'},
  {command:'deposit',description:'Deposit information | ተቀማጭ'},
  {command:'withdraw',description:'Withdrawal information | ገንዘብ ማውጣት'},
  {command:'change_username',description:'Change game name | ስም ቀይር'},
  {command:'agent',description:'Agent information | ወኪል'},
  {command:'support',description:'Support | እርዳታ'},
  {command:'rules',description:'Playing rules | የጨዋታ ደንቦች'},
  {command:'privacy',description:'Privacy | ግላዊነት'},
  {command:'forgetphone',description:'Remove saved phone | የስልክ ቁጥር ሰርዝ'},
  {command:'help',description:'All commands | ትዕዛዞች'}
];

export function telegramClient(token){
  if(!token)throw Error('BOT_TOKEN is required.');
  return async(method,payload={})=>{
    try{
      const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
      const data=await response.json();if(!data.ok)throw Error('rejected');return data.result;
    }catch{throw Error(`Telegram ${method} failed. Check connectivity and private configuration.`);}
  };
}

export class BotContacts {
  constructor(file='data/bot-contacts.json'){this.file=file;this.queue=Promise.resolve();}
  update(id, contact){const run=this.queue.then(async()=>{let rows={};try{rows=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(contact)rows[id]={phone:contact.phone_number,updatedAt:new Date().toISOString()};else delete rows[id];await mkdir(dirname(this.file),{recursive:true});await writeFile(this.file+'.tmp',JSON.stringify(rows));await rename(this.file+'.tmp',this.file);});this.queue=run.catch(()=>{});return run;}
}

export function createBotHandler({appUrl,production=false,deposits,contacts,send,support='',agentContact='',getProfile=async user=>({name:user.first_name||'Player',points:0}),rename,manualPayments=null}) {
  const url=new URL(appUrl);
  if(url.protocol!=='https:'||url.username||url.password)throw Error('MINI_APP_URL must be a public HTTPS URL without credentials.');
  const launch=screen=>{const link=new URL(url);link.searchParams.set('screen',screen==='withdraw'?'wallet':screen);if(screen==='withdraw')link.searchParams.set('tab','withdraw');return link.href;};
  const button=(text,screen)=>({inline_keyboard:[[{text,web_app:{url:launch(screen)}}]]});
  const playText=production?'Open PU Bingo to play a free round.':'Choose your cartela in the 20-unit test game. Winner: 80%. House: 20%. Simulation only; no real ETB.';
  const awaitingNames=new Map();
  return async update=>{
    const message=update.message;
    if(!message||message.chat?.type!=='private'||!message.from?.id)return;
    const id=String(message.from.id),chat=message.chat.id;
    const am=String(message.from.language_code||'').startsWith('am');
    const pick=(en,amharic)=>am?amharic:en;
    const profile=await getProfile(message.from);
    const reply=(text,reply_markup)=>send('sendMessage',{chat_id:chat,text,...(reply_markup?{reply_markup}:{})});
    if(message.contact){
      if(message.contact.user_id!==message.from.id)return reply('Please share only your own contact using the Share my phone button. You may also use /skip.');
      if(!/^\+?\d{7,15}$/.test(message.contact.phone_number))return reply('This phone format is not supported. Use /skip to continue without it.');
      await contacts.update(id,message.contact);
      await reply('Thank you! Your phone number is saved for your registration record. Use /forgetphone to remove it. It does not verify a payment or ownership of a Telebirr account.',{remove_keyboard:true});
      return reply(playText,button(production?'Play free bingo':'Play 20 — TEST ONLY',production?'home':'play20'));
    }
    const text=String(message.text||'').trim();
    const command=text.split(/\s/)[0].split('@')[0].toLowerCase();
    if(manualPayments&&command==='/deposit')return reply(pick('🏦 Manual Telebirr deposit\n\n1. Open your ETB wallet and choose an amount.\n2. Send once to the assigned number after checking the holder name.\n3. Submit your transaction reference.\n4. An administrator checks the actual receiving-account history.\n5. Your ETB wallet is credited once after confirmation.\n\nPasted SMS messages do not automatically verify payments.','🏦 በእጅ የሚረጋገጥ የቴሌብር ተቀማጭ\n\n1. የብር ቦርሳዎን ይክፈቱና መጠኑን ይምረጡ።\n2. የተቀባዩን ስም ካረጋገጡ በኋላ ለተመደበው ቁጥር አንድ ጊዜ ይላኩ።\n3. የግብይት ማጣቀሻውን ያስገቡ።\n4. አስተዳዳሪው ትክክለኛውን የገቢ ዝርዝር ያረጋግጣል።\n5. ከተረጋገጠ በኋላ ብሩ አንድ ጊዜ ወደ ቦርሳዎ ይጨመራል።'),button('Deposit | ተቀማጭ','wallet'));
    if(manualPayments&&command==='/balance'){
      const wallet=manualPayments.wallet(id);
      return reply(pick('💰 Credited ETB balance: '+(wallet.balanceMinor/100).toFixed(2)+' ETB\n\nPending deposit requests: '+wallet.deposits.filter(d=>d.status==='pending').length+'\nGame spending and withdrawals from this wallet are not enabled yet.','💰 የተጨመረ ቀሪ ሂሳብ፦ '+(wallet.balanceMinor/100).toFixed(2)+' ብር\n\nከዚህ ቦርሳ ለጨዋታ መክፈል እና ገንዘብ ማውጣት ገና አልተገናኙም።'),button('Wallet | ቦርሳ','wallet'));
    }
    const nameRequested=awaitingNames.get(id)>Date.now();
    if(awaitingNames.has(id)&&!nameRequested)awaitingNames.delete(id);
    if(command==='/cancel'){awaitingNames.delete(id);return reply(pick('Cancelled. Use /play to continue.','ተሰርዟል። ለመቀጠል /play ይጠቀሙ።'));}
    if((nameRequested&&!text.startsWith('/'))||(command==='/change_username'&&text.includes(' '))){
      const name=command==='/change_username'?text.slice(text.indexOf(' ')+1).trim():text;
      if(!rename)return reply('Name changes are not configured yet.');
      if(!name||[...name].length>40||/[\r\n\u0000-\u001f<>]/.test(name))return reply(pick('Use a name with 1–40 characters, without line breaks or angle brackets.','ከ1 እስከ40 ፊደላት ያለው ስም ያስገቡ። አዲስ መስመር ወይም < > አይጠቀሙ።'));
      await rename(id,name);awaitingNames.delete(id);return reply(pick('Your game name is now: ','የጨዋታ ስምዎ ተቀይሯል፦ ')+name,button('🎮 Play | ተጫወት',production?'home':'play20'));
    }
    switch(command){
      case '/start':return reply('Welcome to PU Bingo! You can optionally share your phone for your registration record, or use /skip to continue without it. We store it on our server until you use /forgetphone or request removal. It is not needed to play. Read /privacy before sharing. Never send PINs, passwords, or sign-in codes.',{keyboard:[[{text:'Share my phone',request_contact:true}],[{text:'/skip'}]],resize_keyboard:true,one_time_keyboard:true});
      case '/skip':await reply('Continue without sharing a phone number.',{remove_keyboard:true});return reply(playText,button(production?'Play free bingo':'Play 20 — TEST ONLY',production?'home':'play20'));
      case '/play':return reply(pick('Welcome, '+profile.name+'!\n\n'+playText,'እንኳን ደህና መጡ፣ '+profile.name+'!\n\n'+(production?'ነፃ ቢንጎ ለመጫወት ከታች ያለውን ቁልፍ ይጫኑ።':'አንድ ካርቴላ 20 የሙከራ ክፍሎች ነው። 80% ለአሸናፊው፣ 20% ለአዘጋጁ። እውነተኛ ገንዘብ አይደለም።')),button(production?'🎮 Play free | በነፃ ተጫወት':'🎮 Play 20 — TEST ONLY',production?'home':'play20'));
      case '/deposit':return production?reply(pick('🏦 Telebirr deposit\n\nReal deposits are not available. Do not send money to any account for this version.','🏦 የቴሌብር ተቀማጭ\n\nእውነተኛ ተቀማጭ አልተገናኘም። ለዚህ ስሪት ወደ ማንኛውም ሂሳብ ገንዘብ አይላኩ።')):reply(pick('🏦 TEST DEPOSITS ONLY\n\n1. Open the test wallet.\n2. Enter a fictional amount and TEST reference.\n3. Wait for administrator approval.\n\nNo Telebirr account is connected. Do not transfer money or paste real SMS receipts.','🏦 የሙከራ ተቀማጭ ብቻ\n\n1. የሙከራ ቦርሳ ይክፈቱ።\n2. የሙከራ መጠን እና TEST ማጣቀሻ ያስገቡ።\n3. የአስተዳዳሪ ማጽደቅ ይጠብቁ።\n\nየቴሌብር ሂሳብ አልተገናኘም። እውነተኛ ገንዘብ አይላኩ።'),button('Open test wallet | ቦርሳ ክፈት','wallet'));
      case '/withdraw':return production?reply(pick('Real withdrawals are not available.','እውነተኛ የገንዘብ ማውጣት አልተገናኘም።')):reply(pick('SIMULATED WITHDRAWALS ONLY. Open the test wallet and enter a fictional amount and TEST recipient label. The amount is reserved until administrator review. No real Telebirr payment is made.','የሙከራ ማውጣት ብቻ። ቦርሳውን ይክፈቱና የሙከራ መጠን እና TEST ተቀባይ ያስገቡ። መጠኑ እስከ ግምገማ ይያዛል። እውነተኛ የቴሌብር ክፍያ አይፈጸምም።'),button('Withdraw | ማውጣት','withdraw'));
      case '/balance':{
        if(production)return reply(pick('💰 Your balance\n\nThis version has no real-money wallet.\nPlay points: '+profile.points,'💰 ቀሪ ሂሳብዎ\n\nይህ ስሪት እውነተኛ የገንዘብ ቦርሳ የለውም።\nየጨዋታ ነጥቦች፦ '+profile.points),button('🎮 Play | ተጫወት','home'));
        const rows=await deposits.list(id),available=balance(rows,id),reserved=rows.filter(r=>r.type==='withdrawal'&&['pending','approved'].includes(r.status)).reduce((sum,r)=>sum+r.minor,0);
        return reply(pick('💰 Your Current Balance — SIMULATION\n\nAvailable: '+(available/100).toFixed(2)+' test units\nReserved: '+(reserved/100).toFixed(2)+' test units\nCards you can buy: '+Math.floor(available/2000)+'\n\nNot cash; cannot be withdrawn.','💰 የሙከራ ቀሪ ሂሳብዎ\n\nየሚገኝ፦ '+(available/100).toFixed(2)+'\nየተያዘ፦ '+(reserved/100).toFixed(2)+'\nመግዛት የሚችሉት ካርቴላ፦ '+Math.floor(available/2000)+'\n\nእውነተኛ ገንዘብ አይደለም።'),button('🎮 Play | ተጫወት','play20'));
      }
      case '/change_username':awaitingNames.set(id,Date.now()+5*60*1000);return reply(pick('Send your new game name (1–40 characters). Use /cancel to stop. This changes your PU Bingo display name, not your Telegram username.','አዲሱን የጨዋታ ስምዎን ይላኩ (ከ1 እስከ40 ፊደላት)። ለመሰረዝ /cancel ይጠቀሙ። ይህ የፒዩ ቢንጎ ስምዎን ብቻ ይቀይራል።'));
      case '/support':return reply(support?pick('💬 PU Bingo support: ','💬 የፒዩ ቢንጎ እርዳታ፦ ')+support:pick('Support contact has not been configured. Ask the game operator to set SUPPORT_CONTACT.','የእርዳታ አድራሻ አልተዘጋጀም። የጨዋታውን አዘጋጅ ያነጋግሩ።'));
      case '/agent':return reply(agentContact?pick('Agent enquiries: ','ስለ ወኪል አገልግሎት፦ ')+agentContact:pick('Agent registration is not configured. '+(support?'Contact '+support:'Use /support to contact the operator.'),'የወኪል ምዝገባ አልተዘጋጀም። /support ይጠቀሙ።'));
      case '/rules':return reply('Choose a cartela in 30 seconds. A number is called every 4 seconds. Complete two distinct lines on the same cartela (rows, columns, or diagonals) and claim BINGO. In test-stake rooms, buy one or more cards for 20 test units each per round. At least 2 paid players are needed; winner gets 80%, house 20%. No winner or an interrupted game means stakes are refunded.',button('Read rules and privacy','rules'));
      case '/privacy':return reply('PU Bingo is independent of Telegram. The game stores your Telegram ID, first name, statistics, and simulated transactions. If you share your phone with this bot, it is stored separately for registration; /forgetphone removes that stored phone. Messages you send also remain in your Telegram chat unless you delete them. Avoid sending real payment details.',button('Rules & Privacy','rules'));
      case '/forgetphone':await contacts.update(id,null);return reply('Your phone record has been removed from PU Bingo. This does not delete the original contact message in Telegram; you can delete it from the chat.');
      case '/help':return reply(BOT_COMMANDS.map(c=>'/'+c.command+' — '+c.description).join('\n')+'\n/cancel — Cancel name change'+(support?'\nSupport: '+support:''));
      default:return reply('Use /play to open the game or /help for commands. Pasted SMS receipts do not verify payments or credit your balance.');
    }
  };
}

export async function startBot({token,appUrl,production,deposits,support,agentContact,getProfile,rename,manualPayments}){
  if(!token)throw Error('BOT_TOKEN is required when BOT_POLLING=true.');
  const send=async(method,payload)=>{
    let response;
    try{response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)});}catch{throw Error('Telegram connection failed.');}
    const data=await response.json();if(!data.ok)throw Error('Telegram API request failed ('+response.status+').');return data.result;
  };
  const handle=createBotHandler({appUrl,production,deposits,contacts:new BotContacts(),send,support,agentContact,getProfile,rename,manualPayments});
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
