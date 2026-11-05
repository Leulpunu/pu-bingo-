import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRound, chooseCard, tickRound, SELECTION_MS, RESULT_MS, winningCardId } from '../rounds.js';
function fixture(){const room={players:new Map([['a',{id:'a',cardId:1}],['b',{id:'b',cardId:2}]])};prepareRound(room,1000);return room;}
test('cartelas are stable, exclusive, validated, and locked during play',()=>{const r=fixture();assert.equal(r.catalog.length,450);assert.throws(()=>chooseCard(r,'a',2));for(const id of [0,451,1.5,'3',null])assert.throws(()=>chooseCard(r,'a',id));chooseCard(r,'a',450);assert.deepEqual(r.players.get('a').card,r.catalog[449]);tickRound(r,1000+SELECTION_MS,()=>{});assert.equal(r.status,'playing');assert.throws(()=>chooseCard(r,'a',3));});
test('server clock starts, draws, ends, and repeats rounds without clients',()=>{const r=fixture();const finish=(r)=>{r.status='finished';r.nextRoundAt=999999+RESULT_MS;};tickRound(r,1000+SELECTION_MS-1,finish);assert.equal(r.status,'waiting');tickRound(r,1000+SELECTION_MS,finish);assert.equal(r.status,'playing');tickRound(r,r.nextDraw,finish);assert.equal(r.drawn.length,1);r.deck=[];tickRound(r,r.nextDraw,finish);assert.equal(r.status,'finished');const c=r.players.get('a').card;r.winner={name:'Previous winner'};tickRound(r,r.nextRoundAt,finish);assert.equal(r.round,2);assert.equal(r.status,'waiting');assert.equal(r.drawn.length,0);assert.equal(r.deck.length,75);assert.equal(r.winner,null);assert.deepEqual(r.players.get('a').card,c);tickRound(r,r.startsAt,finish);assert.equal(r.status,'playing');});

test('two lines must belong to one purchased card, and all purchased cards remain reserved',()=>{
 const a=Array.from({length:25},(_,i)=>i===12?0:i+1),b=Array.from({length:25},(_,i)=>i===12?0:i+26);
 const room={staked:true,catalog:[a,b],drawn:[...a.slice(0,5),...b.slice(0,5)]};const player={cardId:1,cardIds:[1,2]};
 assert.equal(winningCardId(room,player),undefined);
 room.drawn.push(...b.slice(5,10));assert.equal(winningCardId(room,player),2);
 assert.equal(winningCardId(room,{cardIds:[1]}),undefined);
 const r=fixture();r.staked=true;r.players.get('a').cardIds=[1,3];r.players.get('a').paid=true;chooseCard(r,'a',4);assert.throws(()=>chooseCard(r,'b',3));prepareRound(r,2000);assert.deepEqual(r.players.get('a').cardIds,[]);
});
