import test from 'node:test';
import assert from 'node:assert/strict';
import { createNumberCaller } from '../public/voice.js';
test('voice announces each new draw once, respects mute, and falls back to English',()=>{
 const spoken=[],synth={getVoices:()=>[{lang:'en-US'}],cancel(){},speak(u){spoken.push(u);}},caller=createNumberCaller(synth,class{constructor(text){this.text=text;}});
 const room={id:'room',round:1,status:'playing',drawn:[15]};caller.announce(room);assert.equal(spoken.length,0);
 caller.toggle();caller.announce(room,'am');caller.announce(room,'am');assert.equal(spoken.length,1);assert.equal(spoken[0].text,'B, 15');assert.equal(spoken[0].lang,'en-US');
 room.drawn.push(70);caller.announce(room);assert.equal(spoken[1].text,'O, 70');
 caller.toggle();room.drawn.push(42);caller.announce(room);assert.equal(spoken.length,2);
});
test('Amharic voices are selected when present and unsupported devices remain muted',()=>{
 const spoken=[],caller=createNumberCaller({getVoices:()=>[{lang:'am-ET'}],cancel(){},speak(u){spoken.push(u);}},class{constructor(text){this.text=text;}});
 caller.toggle();caller.announce({id:'a',round:1,status:'playing',drawn:[32]},'am');assert.equal(spoken[0].lang,'am-ET');assert.equal(spoken[0].text,'ኤን, 32');
 const unsupported=createNumberCaller(undefined,undefined);assert.equal(unsupported.supported,false);assert.equal(unsupported.toggle(),false);
});
