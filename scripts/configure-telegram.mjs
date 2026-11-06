import { BOT_COMMANDS, telegramClient } from '../bot.js';

const send=telegramClient(process.env.BOT_TOKEN);
const bot=await send('getMe');
if(bot.username!==(process.env.BOT_USERNAME||'').replace(/^@/,''))throw Error('Configured bot username does not match the token.');
const configureWebhook=process.argv.includes('--webhook');
let webhookUrl;
if(configureWebhook){
  if(process.env.BOT_POLLING==='true')throw Error('Set BOT_POLLING=false before configuring a webhook.');
  const secret=process.env.BOT_WEBHOOK_SECRET||'';
  if(!/^[A-Za-z0-9_-]{32,256}$/.test(secret))throw Error('Configure BOT_WEBHOOK_SECRET privately on both the server and this setup environment.');
  const base=new URL(process.env.MINI_APP_URL);
  if(base.protocol!=='https:')throw Error('MINI_APP_URL must use HTTPS.');
  webhookUrl=new URL('/api/telegram/webhook',base).href;
  const response=await fetch(webhookUrl,{signal:AbortSignal.timeout(15000)});const ready=await response.json();
  if(!response.ok||ready.enabled!==true)throw Error('Deploy the updated server with its webhook secret before registering Telegram.');
}
await send('setMyCommands',{commands:BOT_COMMANDS});
await send('setChatMenuButton',{menu_button:{type:'commands'}});
if(configureWebhook){
  await send('setWebhook',{url:webhookUrl,secret_token:process.env.BOT_WEBHOOK_SECRET,allowed_updates:['message'],max_connections:1});
  const status=await send('getWebhookInfo');
  if(status.url!==webhookUrl)throw Error('Webhook URL verification failed.');
}
console.log(JSON.stringify({bot:bot.username,commandsConfigured:BOT_COMMANDS.length,menu:'commands',webhookConfigured:configureWebhook,...(webhookUrl?{webhookUrl}:{})}));
