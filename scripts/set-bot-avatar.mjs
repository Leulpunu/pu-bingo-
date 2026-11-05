import { readFile } from 'node:fs/promises';
const token=process.env.BOT_TOKEN;
if(!token)throw Error('Set BOT_TOKEN privately before running this script.');
async function request(method,body){
  try{
    const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',body,signal:AbortSignal.timeout(30000)});
    const data=await response.json();if(!data.ok)throw Error('request-failed');return data.result;
  }catch{throw Error(`Telegram ${method} failed. No credentials were logged.`);}
}
const bot=await request('getMe');
if(bot.username!==(process.env.BOT_USERNAME||'').replace(/^@/,''))throw Error('Bot username does not match configuration.');
const form=new FormData();
form.set('photo',JSON.stringify({type:'static',photo:'attach://avatar'}));
form.set('avatar',new Blob([await readFile(new URL('../public/pu-bingo-telegram.jpg',import.meta.url))],{type:'image/jpeg'}),'pu-bingo.jpg');
await request('setMyProfilePhoto',form);
const verify=new FormData();verify.set('user_id',String(bot.id));verify.set('limit','1');
const photos=await request('getUserProfilePhotos',verify);
console.log(JSON.stringify({bot:bot.username,profilePhotoSet:true,profilePhotoPresent:photos.total_count>0}));
