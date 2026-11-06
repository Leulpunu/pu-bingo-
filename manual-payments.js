import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function normalizePhone(value){
  let number=String(value||'').replace(/[\s()-]/g,'');
  if(/^0[79]\d{8}$/.test(number))number='+251'+number.slice(1);
  if(/^251[79]\d{8}$/.test(number))number='+'+number;
  if(!/^\+251[79]\d{8}$/.test(number))throw Error('Invalid Ethiopian receiving number.');
  return number;
}
export function parseAmount(value){
  if(typeof value!=='string'||!/^\d{1,5}(?:\.\d{1,2})?$/.test(value))throw Error('Enter an amount with up to two decimal places.');
  const [whole,fraction='']=value.split('.');const minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(minor<100||minor>1000000)throw Error('Deposit amount must be between 1 and 10,000 ETB.');
  return minor;
}
function reference(value){
  const ref=typeof value==='string'?value.trim().toUpperCase():'';
  if(!/^[A-Z0-9-]{6,40}$/.test(ref))throw Error('Enter the transaction reference only (6–40 letters, digits or hyphens).');
  return ref;
}
function userId(value){if(typeof value!=='string'||!/^\d{1,16}$/.test(value))throw Error('A verified Telegram account is required.');return value;}
export function receivingAccounts(raw){
  let accounts;try{accounts=JSON.parse(raw);}catch{throw Error('MANUAL_TELEBIRR_ACCOUNTS must be a JSON array of receiving accounts.');}
  if(!Array.isArray(accounts)||accounts.length!==3)throw Error('Configure all three receiving accounts.');
  const parsed=accounts.map(account=>{
    const phone=normalizePhone(account?.phone),name=String(account?.name||'').trim();
    if(!name||name.length>100||/REPLACE|PLACEHOLDER/i.test(name))throw Error('Each receiving account needs its correct holder name.');
    return {phone,name};
  });
  if(new Set(parsed.map(a=>a.phone)).size!==3)throw Error('Receiving accounts must have distinct numbers.');
  return parsed;
}

export class ManualPayments {
  constructor({file='data/manual-payments.sqlite',accounts}){
    this.accounts=receivingAccounts(JSON.stringify(accounts));
    if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
    this.db=new DatabaseSync(file,{timeout:5000});
    if(file!==':memory:'&&process.platform!=='win32')chmodSync(file,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS deposits(
        id TEXT PRIMARY KEY,user TEXT NOT NULL,request_key TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 100 AND 1000000),
        phone TEXT NOT NULL,holder TEXT NOT NULL,reference TEXT UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('awaiting_reference','pending','approved','rejected','cancelled')),
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL,reviewer TEXT,reason TEXT,
        UNIQUE(user,request_key)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS ledger(
        id TEXT PRIMARY KEY,deposit_id TEXT NOT NULL REFERENCES deposits(id),
        user TEXT NOT NULL,delta_minor INTEGER NOT NULL CHECK(delta_minor!=0),
        currency TEXT NOT NULL CHECK(currency='ETB'),created_at TEXT NOT NULL,
        UNIQUE(deposit_id,user)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS audit(
        id TEXT PRIMARY KEY,deposit_id TEXT NOT NULL REFERENCES deposits(id),
        actor TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL
      ) STRICT;
      CREATE TRIGGER IF NOT EXISTS immutable_ledger_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger entries are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_ledger_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger entries are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_audit_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit entries are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_audit_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit entries are immutable'); END;
      CREATE INDEX IF NOT EXISTS deposit_user ON deposits(user,created_at);
      CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user);`);
  }
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  row(id){return this.db.prepare('SELECT * FROM deposits WHERE id=?').get(id);}
  audit(id,actor,action,details={}){this.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(randomUUID(),id,actor,action,JSON.stringify(details),new Date().toISOString());}
  create(user,amount,key){
    userId(user);const minor=parseAmount(amount);
    if(typeof key!=='string'||! /^[a-f0-9-]{36}$/i.test(key))throw Error('Invalid deposit request key.');
    return this.transaction(()=>{
      const existing=this.db.prepare('SELECT * FROM deposits WHERE user=? AND request_key=?').get(user,key);
      if(existing){if(existing.amount_minor!==minor)throw Error('This request key already uses a different amount.');return existing;}
      const count=this.db.prepare("SELECT COUNT(*) AS n FROM deposits WHERE user=? AND status IN ('awaiting_reference','pending')").get(user).n;
      if(count>=5)throw Error('You already have five open deposit requests.');
      const total=this.db.prepare('SELECT COUNT(*) AS n FROM deposits').get().n;
      const account=this.accounts[total%this.accounts.length],id=randomUUID(),now=new Date().toISOString();
      this.db.prepare('INSERT INTO deposits(id,user,request_key,amount_minor,phone,holder,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,user,key,minor,account.phone,account.name,'awaiting_reference',now,now);
      this.audit(id,user,'created',{amountMinor:minor,phone:account.phone});return this.row(id);
    });
  }
  submitReference(user,id,value){
    userId(user);const ref=reference(value);
    return this.transaction(()=>{
      const row=this.row(id);if(!row||row.user!==user)throw Error('Deposit request not found.');
      if(row.reference===ref&&['pending','approved'].includes(row.status))return row;
      if(row.status!=='awaiting_reference')throw Error('This request no longer accepts a reference.');
      if(this.db.prepare('SELECT id FROM deposits WHERE reference=?').get(ref))throw Error('This reference is already recorded. Contact support if you believe this is an error.');
      this.db.prepare("UPDATE deposits SET reference=?,status='pending',updated_at=? WHERE id=?").run(ref,new Date().toISOString(),id);
      this.audit(id,user,'reference_submitted',{reference:ref});return this.row(id);
    });
  }
  cancel(user,id){
    userId(user);return this.transaction(()=>{
      const row=this.row(id);if(!row||row.user!==user)throw Error('Deposit request not found.');
      if(row.status==='cancelled')return row;
      if(row.status!=='awaiting_reference')throw Error('Only an unpaid request without a reference can be cancelled.');
      this.db.prepare("UPDATE deposits SET status='cancelled',updated_at=? WHERE id=?").run(new Date().toISOString(),id);this.audit(id,user,'cancelled');return this.row(id);
    });
  }
  review(actor,id,decision,proof={}){
    userId(actor);if(!['approved','rejected'].includes(decision))throw Error('Invalid review decision.');
    return this.transaction(()=>{
      const row=this.row(id);if(!row)throw Error('Deposit request not found.');
      if(row.user===actor)throw Error('Administrators cannot approve or reject their own deposits.');
      if(row.status===decision)return row;
      if(row.status!=='pending')throw Error('Only pending deposits can be reviewed.');
      const now=new Date().toISOString();
      if(decision==='approved'){
        if(proof.received!==true)throw Error('Confirm the actual incoming transfer in the receiving account.');
        if(parseAmount(proof.amount)!==row.amount_minor||normalizePhone(proof.phone)!==row.phone||reference(proof.reference)!==row.reference)throw Error('Confirmed amount, account and reference must match the request.');
        const entries=this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?)');
        entries.run(randomUUID(),id,row.user,row.amount_minor,'ETB',now);
        entries.run(randomUUID(),id,'@telebirr-clearing',-row.amount_minor,'ETB',now);
      }else if(typeof proof.reason!=='string'||proof.reason.trim().length<3||proof.reason.length>300)throw Error('Enter a rejection reason (3–300 characters).');
      this.db.prepare('UPDATE deposits SET status=?,reviewer=?,reason=?,updated_at=? WHERE id=?').run(decision,actor,decision==='rejected'?proof.reason.trim():null,now,id);
      this.audit(id,actor,decision,decision==='approved'?{received:true,amountMinor:row.amount_minor,phone:row.phone,reference:row.reference}:{reason:proof.reason.trim()});return this.row(id);
    });
  }
  wallet(user){userId(user);return {currency:'ETB',balanceMinor:this.db.prepare('SELECT COALESCE(SUM(delta_minor),0) AS n FROM ledger WHERE user=?').get(user).n,deposits:this.db.prepare('SELECT * FROM deposits WHERE user=? ORDER BY created_at DESC LIMIT 100').all(user),spendingEnabled:false,withdrawalsEnabled:false};}
  pending(){return this.db.prepare("SELECT * FROM deposits WHERE status='pending' ORDER BY created_at LIMIT 500").all();}
  close(){this.db.close();}
}
