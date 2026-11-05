import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { card, hasBingo, verifyTelegram } from '../game.js';
test('cards have a free center, unique numbers, and correct column ranges',()=>{for(let k=0;k<100;k++){const c=card();assert.equal(c.length,25);assert.equal(c[12],0);assert.equal(new Set(c).size,25);c.forEach((n,i)=>{if(i!==12)assert.ok(n>=(i%5)*15+1&&n<=(i%5+1)*15);});}});
test('bingo requires two distinct complete lines on one card',()=>{
 const c=card();const lines=[];for(let i=0;i<5;i++){lines.push(Array.from({length:5},(_,j)=>i*5+j),Array.from({length:5},(_,j)=>j*5+i));}lines.push([0,6,12,18,24],[4,8,12,16,20]);
 assert.equal(hasBingo(c,[]),false);
 for(const line of lines){const draw=line.map(i=>c[i]);assert.equal(hasBingo(c,draw),false);assert.equal(hasBingo(c,[...draw,...draw]),false);}
 for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){const indexes=[...new Set([...lines[i],...lines[j]])];const draw=indexes.map(k=>c[k]);assert.equal(hasBingo(c,draw),true);const exclusive=lines[j].find(k=>!lines[i].includes(k)&&k!==12);assert.equal(hasBingo(c,draw.filter(n=>n!==c[exclusive])),false);}
});

test('Telegram signatures reject tampering and expired sessions',()=>{const token='test-token',now=Date.now();const p=new URLSearchParams({auth_date:String(Math.floor(now/1000)),user:JSON.stringify({id:123,first_name:'Player'})});const data=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update(data).digest('hex'));assert.equal(verifyTelegram(p.toString(),token,now).id,123);assert.throws(()=>verifyTelegram(p.toString(),token,now+3601_000));p.set('user','{"id":999}');assert.throws(()=>verifyTelegram(p.toString(),token,now));});
