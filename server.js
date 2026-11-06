import http from 'node:http';
import { startBot, createBotHandler, BotContacts, telegramClient } from './bot.js';
import { TelegramWebhook } from './telegram-webhook.js';
import { timingSafeEqual } from 'node:crypto';
import { TestDeposits, balance, prizeSplit, STAKE_MINOR } from './deposits.js';
const testDeposits = new TestDeposits();
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { hasBingo, verifyTelegram } from './game.js';
import { prepareRound, chooseCard, tickRound, RESULT_MS, winningCardId } from './rounds.js';
const port=Number(process.env.PORT||3000), production=process.env.NODE_ENV==='production';
if(production&&!process.env.BOT_TOKEN)throw Error('BOT_TOKEN is required in production');
await testDeposits.recover();
const sessions=new Map(), rooms=new Map();let profiles={};
try{profiles=JSON.parse(await readFile('data/profiles.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
let saving=Promise.resolve();function persist(){const snapshot=JSON.stringify(profiles);saving=saving.then(async()=>{await mkdir('data',{recursive:true});await writeFile('data/profiles.tmp',snapshot);await rename('data/profiles.tmp','data/profiles.json');}).catch(console.error);}
const paidCards=room=>[...room.players.values()].reduce((sum,p)=>sum+(p.cardIds||[]).length,0);
function view(room,id){return {id:room.id,host:room.host,status:room.status,practice:room.practice,staked:room.staked||false,paid:room.players.get(id)?.paid||false,cardIds:room.players.get(id)?.cardIds||[],cards:(room.players.get(id)?.cardIds||[]).map(cardId=>({cardId,card:room.catalog[cardId-1]})),paidCount:paidCards(room),stakeMinor:STAKE_MINOR,...prizeSplit(paidCards(room)),settlement:room.settlement,drawn:room.drawn,nextDraw:room.nextDraw,winner:room.winner,round:room.round,startsAt:room.startsAt,nextRoundAt:room.nextRoundAt,serverTime:Date.now(),cardId:room.players.get(id)?.cardId,takenCards:[...room.players.values()].filter(p=>p.id!==id).flatMap(p=>[p.cardId,...(p.cardIds||[])]),players:[...room.players.values()].map(p=>({id:p.id,name:p.name})),card:room.players.get(id)?.card};}
async function finish(room,winner,reason='no-winner'){
 if(room.status==='finished')return;
 if(room.staked)room.settlement=await testDeposits.settle(room.roundKey,winner?.id||null,reason);
 room.status='finished';room.nextRoundAt=Date.now()+RESULT_MS;room.winner=winner?{id:winner.id,name:winner.name,cardId:winner.cardId,card:winner.card}:null;room.updated=Date.now();
 for(const p of room.players.values()){if(room.staked&&!p.paid)continue;const profile=profiles[p.id];profile.played++;if(p.id===winner?.id){profile.wins++;profile.points+=100;}else profile.points+=10;}persist();
}
let ticking=false;
setInterval(async()=>{if(ticking)return;ticking=true;try{const now=Date.now();for(const room of rooms.values()){
 if(room.busy)continue;room.busy=true;try{
 if(now-room.updated>6*3600_000){if(room.staked)await testDeposits.settle(room.roundKey,null,'room-expired');rooms.delete(room.id);continue;}
 if(room.staked&&room.status==='waiting'&&now>=room.startsAt&&[...room.players.values()].filter(p=>p.paid).length<2)await finish(room,null,'not-enough-players');
 else await tickRound(room,now,finish);
 }catch(e){console.error('Round update failed',e);}finally{room.busy=false;}
 }for(const [k,v]of sessions)if(v.expires<now)sessions.delete(k);
 }finally{ticking=false;}},500).unref();
if(process.env.BOT_POLLING==='true'&&process.env.BOT_WEBHOOK_SECRET)throw Error('Use either polling or a webhook, not both.');
const getBotProfile=async user=>{const id=String(user.id);if(!profiles[id]){profiles[id]={id,name:String(user.first_name||'Player').slice(0,40),points:0,wins:0,played:0};persist();}return profiles[id];};
const renameBotProfile=async(id,name)=>{profiles[id].name=name;for(const room of rooms.values()){const player=room.players.get(id);if(player)player.name=name;}persist();await saving;};
const webhook=process.env.BOT_WEBHOOK_SECRET?new TelegramWebhook(process.env.BOT_WEBHOOK_SECRET,createBotHandler({
 appUrl:process.env.MINI_APP_URL,production,deposits:testDeposits,contacts:new BotContacts(),send:telegramClient(process.env.BOT_TOKEN),support:process.env.SUPPORT_CONTACT||'',agentContact:process.env.AGENT_CONTACT||'',
 getProfile:getBotProfile,
 rename:renameBotProfile
})):null;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};try{
if(!url.pathname.startsWith('/api/')){const files={'/':'index.html','/pu-bingo-avatar.png':'pu-bingo-avatar.png','/app.js':'app.js','/language.js':'language.js','/voice.js':'voice.js','/player-views.js':'player-views.js','/withdrawals.js':'withdrawals.js','/bingo-rules.js':'bingo-rules.js','/style.css':'style.css'};const file=files[url.pathname];if(!file){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':types['.'+file.split('.').pop()],'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});return res.end(await readFile(new URL('./public/'+file,import.meta.url)));}
let body={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)return send(413,{error:'Request too large'});}try{body=JSON.parse(raw||'{}');}catch{return send(400,{error:'Invalid JSON'});}}
if(url.pathname==='/api/telegram/webhook'){
 if(req.method==='GET')return send(200,{enabled:!!webhook});
 if(req.method!=='POST')return send(405,{error:'Method not allowed.'});
 if(!webhook)return send(503,{error:'Webhook is not configured.'});
 try{return send(200,await webhook.deliver(req.headers['x-telegram-bot-api-secret-token'],body));}catch(e){return send(e.status||503,{error:e.status?e.message:'Telegram update could not be handled. Please retry.'});}
}
if(url.pathname==='/api/auth'&&req.method==='POST'){let user;if(body.initData){try{user=verifyTelegram(body.initData,process.env.BOT_TOKEN||'');}catch(e){return send(401,{error:e.message});}}else if(!production){user={id:'guest-'+(typeof body.guest==='string'&&/^[a-f0-9-]{36}$/.test(body.guest)?body.guest:randomUUID()),first_name:'Guest'};}else return send(401,{error:'Please open PU Bingo inside Telegram.'});const id=String(user.id);profiles[id]??={id,name:String(user.first_name||'Player').slice(0,40),points:0,wins:0,played:0};const token=randomBytes(32).toString('hex');sessions.set(token,{id,expires:Date.now()+3600_000});return send(200,{token,profile:profiles[id],demo:!body.initData,simulation:!production,botUsername:process.env.BOT_USERNAME||''});}
const session=sessions.get(req.headers.authorization?.replace('Bearer ',''));if(!session||session.expires<Date.now())return send(401,{error:'Session expired. Reload to sign in.'});const id=session.id,profile=profiles[id];

if(url.pathname.startsWith('/api/test-')){
 if(production)return send(403,{error:'Deposit simulation is disabled in production.'});
 const adminKey=process.env.TEST_ADMIN_KEY||'';const provided=String(req.headers['x-test-admin-key']||'');
 const admin=adminKey.length>=24&&Buffer.byteLength(adminKey)===Buffer.byteLength(provided)&&timingSafeEqual(Buffer.from(adminKey),Buffer.from(provided));
 try{
 if(url.pathname==='/api/test-table'&&req.method==='POST'){
 let room=[...rooms.values()].find(r=>r.publicTable);
 if(!room){if(rooms.size>=500)return send(429,{error:'Rooms are full. Try later.'});room={id:randomBytes(4).toString('hex').toUpperCase(),host:id,practice:false,staked:true,publicTable:true,players:new Map(),updated:Date.now()};prepareRound(room);rooms.set(room.id,room);}
 if(room.busy)return send(409,{error:'Table is updating. Try again.'});
 if(!room.players.has(id)){if(room.players.size>=450)return send(409,{error:'The public table is full.'});const cardId=Array.from({length:450},(_,i)=>i+1).find(n=>![...room.players.values()].some(p=>p.cardId===n||(p.cardIds||[]).includes(n)));if(!cardId)return send(409,{error:'All cartelas are reserved.'});if(!cardId)return send(409,{error:'All cartelas are reserved.'});room.players.set(id,{id,name:profile.name,cardId,card:room.catalog[cardId-1],paid:false});}
 room.updated=Date.now();return send(200,view(room,id));
 }
 if(url.pathname==='/api/test-wallet'&&req.method==='GET'){const rows=await testDeposits.list(id);return send(200,{simulation:true,balanceMinor:balance(rows,id),deposits:rows.filter(r=>!r.type||r.type==='deposit'),withdrawals:rows.filter(r=>r.type==='withdrawal'),reservedMinor:rows.filter(r=>r.type==='withdrawal'&&['pending','approved'].includes(r.status)).reduce((sum,r)=>sum+r.minor,0),transactions:rows.filter(r=>r.type&&r.type!=='deposit'&&r.type!=='withdrawal')});}
 if(url.pathname==='/api/test-withdrawals'&&req.method==='POST')return send(201,await testDeposits.withdraw(id,body.amount,body.recipient,body.requestKey));
 if(url.pathname==='/api/test-admin/withdrawals'&&req.method==='GET'){if(!admin)return send(403,{error:'Administrator key is missing or invalid.'});return send(200,(await testDeposits.list()).filter(r=>r.type==='withdrawal'));}
 if(url.pathname==='/api/test-admin/withdrawals/review'&&req.method==='POST'){if(!admin)return send(403,{error:'Administrator key is missing or invalid.'});return send(200,await testDeposits.reviewWithdrawal(body.id,body.decision,id,body.reference,body.reason));}
 if(url.pathname==='/api/test-deposits'&&req.method==='POST')return send(201,await testDeposits.submit(id,body.amount,body.reference));
 if(url.pathname==='/api/test-admin/deposits'&&req.method==='GET'){if(!admin)return send(403,{error:'Administrator key is missing or invalid.'});return send(200,(await testDeposits.list()).filter(r=>!r.type||r.type==='deposit'));}
 if(url.pathname==='/api/test-admin/house'&&req.method==='GET'){if(!admin)return send(403,{error:'Administrator key is missing or invalid.'});const rows=await testDeposits.list();return send(200,{balanceMinor:balance(rows,'@house'),settlements:rows.filter(r=>r.type==='settlement')});}
 if(url.pathname==='/api/test-admin/review'&&req.method==='POST'){if(!admin)return send(403,{error:'Administrator key is missing or invalid.'});return send(200,await testDeposits.review(body.id,body.decision,id));}
 }catch(e){return send(400,{error:e.message});}
 return send(404,{error:'Not found'});
}
if(url.pathname==='/api/profile'&&req.method==='GET')return send(200,profile);
if(url.pathname==='/api/leaderboard'&&req.method==='GET')return send(200,Object.values(profiles).sort((a,b)=>b.points-a.points).slice(0,20).map(({name,points,wins})=>({name,points,wins})));
if(url.pathname==='/api/rooms'&&req.method==='GET')return send(200,[...rooms.values()].filter(r=>!r.practice&&r.status==='waiting').map(r=>({id:r.id,players:r.players.size,staked:!!r.staked,hostName:r.players.get(r.host).name})));
if(url.pathname==='/api/rooms'&&req.method==='POST'){if(body.staked&&body.practice)return send(400,{error:'Test stakes require a multiplayer room.'});if(body.staked&&production)return send(403,{error:'Stake simulation is disabled in production.'});if(rooms.size>=500)return send(429,{error:'Rooms are full. Try later.'});const existing=[...rooms.values()].find(r=>r.host===id&&r.practice===!!body.practice&&!!r.staked===!!body.staked);if(existing)return send(200,view(existing,id));const room={id:randomBytes(4).toString('hex').toUpperCase(),host:id,practice:!!body.practice,staked:!!body.staked,status:'waiting',players:new Map([[id,{id,name:profile.name,cardId:1}]]),drawn:[],deck:[],nextDraw:0,updated:Date.now()};prepareRound(room);rooms.set(room.id,room);return send(201,view(room,id));}
const match=url.pathname.match(/^\/api\/rooms\/([A-F0-9]{8})(?:\/(join|start|claim|card|buy))?$/);if(match){const room=rooms.get(match[1]);if(!room)return send(404,{error:'Room not found'});const action=match[2];if(req.method==='POST'&&room.busy)return send(409,{error:'Round updating. Please try again.'});if(req.method==='POST')room.busy=true;try{if(action==='join'&&req.method==='POST'){if(!room.players.has(id)){if(room.practice||room.status!=='waiting'||room.players.size>=450)return send(409,{error:'This room is no longer accepting players'});const cardId=Array.from({length:450},(_,i)=>i+1).find(n=>![...room.players.values()].some(p=>p.cardId===n||(p.cardIds||[]).includes(n)));if(!cardId)return send(409,{error:'All cartelas are reserved.'});room.players.set(id,{id,name:profile.name,cardId,card:room.catalog[cardId-1]});}return send(200,view(room,id));}if(!room.players.has(id))return send(403,{error:'Join this room first'});room.updated=Date.now();if(!action&&req.method==='GET')return send(200,view(room,id));if(action==='buy'&&req.method==='POST'){if(!room.staked||production)return send(403,{error:'Only test-stake rooms accept purchases.'});if(room.status!=='waiting'||Date.now()>=room.startsAt)return send(409,{error:'Card purchases are closed for this round.'});try{await testDeposits.buy(id,room.roundKey,room.players.get(id).cardId);const player=room.players.get(id);player.cardIds??=[];if(!player.cardIds.includes(player.cardId))player.cardIds.push(player.cardId);player.paid=true;}catch(e){return send(409,{error:e.message});}return send(200,view(room,id));}if(action==='card'&&req.method==='POST'){try{if(Date.now()>=room.startsAt)throw Error('Card selection is closed.');chooseCard(room,id,body.cardId);}catch(e){return send(409,{error:e.message});}return send(200,view(room,id));}if(action==='start'&&req.method==='POST'){if(room.staked)return send(409,{error:'Test-stake rounds start automatically after card selection.'});if(room.host!==id||room.status!=='waiting')return send(409,{error:'Only the host can start a waiting game'});room.status='playing';room.nextDraw=Date.now()+1000;return send(200,view(room,id));}if(action==='claim'&&req.method==='POST'){if(room.staked&&!room.players.get(id).paid)return send(409,{error:'Buy a cartela before the round starts to claim a prize.'});const player=room.players.get(id);const winningId=winningCardId(room,player);if(room.status!=='playing'||!winningId)return send(409,{error:'No bingo yet. Complete two lines on the same cartela: rows, columns, or diagonals.'});await finish(room,{...player,cardId:winningId,card:room.catalog[winningId-1]});return send(200,view(room,id));}}finally{if(req.method==='POST')room.busy=false;}}
send(404,{error:'Not found'});
}catch(e){console.error(e);if(!res.headersSent)send(500,{error:'Something went wrong. Please try again.'});else res.end();}});
server.listen(port,()=>console.log(`PU Bingo running at http://localhost:${server.address().port}`));

if(process.env.BOT_POLLING==='true'){
 try{await startBot({token:process.env.BOT_TOKEN,appUrl:process.env.MINI_APP_URL,production,deposits:testDeposits,support:process.env.SUPPORT_CONTACT||'',agentContact:process.env.AGENT_CONTACT||'',getProfile:getBotProfile,rename:renameBotProfile});console.log('Telegram bot polling started.');}
 catch(e){console.error('Bot startup failed: '+e.message);server.close();process.exitCode=1;}
}
