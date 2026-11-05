import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export const STAKE_MINOR = 2000;
export function prizeSplit(cartelas) {
  if (!Number.isInteger(cartelas) || cartelas < 0 || cartelas > 450) throw Error('Invalid cartela count.');
  const totalMinor = cartelas * STAKE_MINOR;
  return { totalMinor, prizeMinor: totalMinor * 80 / 100, houseMinor: totalMinor * 20 / 100 };
}
export function balance(rows, user) {
  return rows.filter(r => r.user === user && (r.status === 'approved' ||
    (r.type === 'withdrawal' && ['pending','paid'].includes(r.status))))
    .reduce((sum, r) => sum + (['stake','withdrawal'].includes(r.type) ? -r.minor : r.minor), 0);
}

// Simulation only: this store never represents money received by a provider.
export class TestDeposits {
  constructor(file='data/test-deposits.json') { this.file=file; this.queue=Promise.resolve(); }
  async load() { try { return JSON.parse(await readFile(this.file,'utf8')); } catch(e) { if(e.code==='ENOENT')return [];throw e; } }
  transaction(fn) {
    const result=this.queue.then(async()=>{const rows=await this.load();const value=fn(rows);await mkdir(dirname(this.file),{recursive:true});await writeFile(this.file+'.tmp',JSON.stringify(rows));await rename(this.file+'.tmp',this.file);return value;});
    this.queue=result.catch(()=>{});return result;
  }
  submit(user, amount, reference) {
    if(typeof amount!=='string'||!/^\d{1,5}(\.\d{1,2})?$/.test(amount))throw Error('Enter a test amount with up to two decimal places.');
    const minor=Math.round(Number(amount)*100);
    if(minor<100||minor>1000000)throw Error('Test amount must be between 1 and 10,000.');
    if(typeof reference!=='string'||!/^TEST-[A-Z0-9-]{6,40}$/i.test(reference))throw Error('Use a simulated reference such as TEST-ABC123.');
    reference=reference.toUpperCase();
    return this.transaction(rows=>{if(rows.some(r=>r.reference===reference))throw Error('This reference has already been submitted.');if(rows.filter(r=>r.user===user&&r.status==='pending').length>=5)throw Error('You already have five pending requests.');const row={id:randomUUID(),type:'deposit',user,minor,reference,status:'pending',createdAt:new Date().toISOString()};rows.push(row);return row;});
  }
  review(id, decision, reviewer) {
    if(!['approved','rejected'].includes(decision))throw Error('Choose approve or reject.');
    return this.transaction(rows=>{const row=rows.find(r=>r.id===id);if(!row || (row.type && row.type!=='deposit'))throw Error('Deposit request not found.');if(row.status!=='pending')throw Error('This request has already been reviewed.');row.status=decision;row.reviewedAt=new Date().toISOString();row.reviewer=reviewer;return row;});
  }
  withdraw(user, amount, recipient, requestKey) {
    if(typeof amount!=='string'||!/^\d{1,5}(\.\d{1,2})?$/.test(amount))throw Error('Enter a test amount with up to two decimal places.');
    const minor=Math.round(Number(amount)*100);
    if(minor<100||minor>1000000)throw Error('Test amount must be between 1 and 10,000.');
    if(typeof recipient!=='string'||!/^TEST-[A-Z0-9-]{3,40}$/i.test(recipient))throw Error('Use a fictional recipient such as TEST-TELEBIRR.');
    if(typeof requestKey!=='string'||! /^[a-f0-9-]{36}$/i.test(requestKey))throw Error('Invalid withdrawal request key.');
    recipient=recipient.toUpperCase();
    return this.transaction(rows=>{
      const existing=rows.find(r=>r.type==='withdrawal'&&r.user===user&&r.requestKey===requestKey);
      if(existing){if(existing.minor!==minor||existing.recipient!==recipient)throw Error('Request key already used with different details.');return existing;}
      if(rows.filter(r=>r.type==='withdrawal'&&r.user===user&&['pending','approved'].includes(r.status)).length>=5)throw Error('You already have five open withdrawal requests.');
      if(balance(rows,user)<minor)throw Error('Not enough available test balance.');
      const row={id:randomUUID(),type:'withdrawal',user,minor,recipient,requestKey,status:'pending',createdAt:new Date().toISOString(),events:[]};rows.push(row);return row;
    });
  }
  reviewWithdrawal(id, decision, reviewer, reference='', reason='') {
    if(!['approved','paid','rejected'].includes(decision))throw Error('Invalid withdrawal decision.');
    if(decision==='paid'&&(typeof reference!=='string'||!/^TEST-[A-Z0-9-]{6,40}$/i.test(reference)))throw Error('Enter a fictional payout reference beginning with TEST-.');
    if(decision==='rejected'&&(typeof reason!=='string'||reason.trim().length<3||reason.length>200))throw Error('Enter a rejection reason (3–200 characters).');
    return this.transaction(rows=>{
      const row=rows.find(r=>r.id===id&&r.type==='withdrawal');if(!row)throw Error('Withdrawal not found.');
      reference=String(reference).toUpperCase();
      if(row.status===decision){if(decision==='paid'&&row.reference!==reference)throw Error('Already paid with a different reference.');return row;}
      if(!(['pending','approved'].includes(row.status))||(decision==='approved'&&row.status!=='pending')||(decision==='paid'&&row.status!=='approved'))throw Error('This withdrawal cannot make that transition.');
      if(decision==='paid'&&rows.some(r=>r.reference===reference))throw Error('This payout reference has already been used.');
      const at=new Date().toISOString();row.status=decision;row.reviewedAt=at;row.reviewer=reviewer;
      if(decision==='paid')row.reference=reference;
      if(decision==='rejected')row.reason=reason.trim();
      row.events.push({status:decision,at,reviewer,...(decision==='paid'?{reference}:{}),...(decision==='rejected'?{reason:row.reason}:{})});
      return row;
    });
  }
  buy(user, roundKey, cardId) {
    if(!Number.isInteger(cardId)||cardId<1||cardId>450)throw Error('Invalid cartela number.');
    return this.transaction(rows => {
      if (rows.some(r => r.roundKey === roundKey && r.type === 'settlement')) throw Error('Round is already settled.');
      const existing = rows.find(r => r.type === 'stake' && r.roundKey === roundKey && r.user === user && r.cardId === cardId);
      if (existing) return existing;
      if (rows.some(r => r.type === 'stake' && r.roundKey === roundKey && r.cardId === cardId)) throw Error('Cartela already purchased.');
      if (balance(rows, user) < STAKE_MINOR) throw Error('Not enough test balance. Get a simulated deposit approved first.');
      const row = {id:randomUUID(),type:'stake',user,roundKey,cardId,minor:STAKE_MINOR,status:'approved',createdAt:new Date().toISOString()};
      rows.push(row); return row;
    });
  }
  settle(roundKey, winnerId = null, reason = 'no-winner') {
    return this.transaction(rows => {
      const existing = rows.find(r => r.type === 'settlement' && r.roundKey === roundKey);
      if (existing) return existing;
      const stakes = rows.filter(r => r.type === 'stake' && r.roundKey === roundKey);
      if (winnerId && !stakes.some(r => r.user === winnerId)) throw Error('Winner has no paid cartela.');
      const split = prizeSplit(stakes.length), createdAt = new Date().toISOString();
      const add = (type, user, minor) => rows.push({id:randomUUID(),type,user,minor,roundKey,status:'approved',createdAt});
      if (winnerId) { add('prize', winnerId, split.prizeMinor); add('house', '@house', split.houseMinor); }
      else for (const stake of stakes) add('refund', stake.user, stake.minor);
      const result = {id:randomUUID(),type:'settlement',roundKey,winnerId,reason:winnerId?'bingo':reason,...split,refunded:!winnerId,status:'settled',createdAt};
      rows.push(result); return result;
    });
  }
  async recover() {
    const rows = await this.list();
    const unfinished = new Set(rows.filter(r => r.type === 'stake' && !rows.some(s => s.type === 'settlement' && s.roundKey === r.roundKey)).map(r => r.roundKey));
    for (const key of unfinished) await this.settle(key, null, 'server-restart');
  }
  async list(user) { await this.queue;const rows=await this.load();return user?rows.filter(r=>r.user===user):rows; }
}
