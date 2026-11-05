import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../public/language.js';
test('Amharic game controls and two-line rules are translated; English is preserved',()=>{
 assert.equal(translate('Choose your cartela','am'),'ካርቴላዎን ይምረጡ');
 assert.match(translate('Claim BINGO! ✦','am'),/2 ዝግ/);
 assert.equal(translate('Choose your cartela','en'),'Choose your cartela');
 assert.equal(translate('450','am'),'450');
 assert.equal(translate('B15','am'),'B15');
 assert.match(translate('ROUND 12 · ROOM ABCDEF12','am'),/12.*ABCDEF12/);
 assert.match(translate('Winner 80%: 1456.00 | House 20%: 364.00','am'),/1456.00.*364.00/);
 assert.equal(translate('  Players  ','am'),'  ተጫዋቾች  ');
});
