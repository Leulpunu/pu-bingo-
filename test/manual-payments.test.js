import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { ManualPayments, parseAmount, receivingAccounts } from '../manual-payments.js';
const accounts=['+251900000001','+251900000002','+251900000003'].map((phone,i)=>({phone,name:'Holder '+(i+1)}));
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'pu-etb-'));const store=new ManualPayments({file:join(dir,'payments.sqlite'),accounts});try{await fn(store);}finally{store.close();await rm(dir,{recursive:true,force:true});}}
const proof=row=>({received:true,amount:(row.amount_minor/100).toFixed(2),phone:row.phone,reference:row.reference});
const pending=(store,user='123',ref='ACTUAL123')=>{const row=store.create(user,'100.25',randomUUID());return store.submitReference(user,row.id,ref);};
test('deposit amounts use exact hundredths and configuration validates all three holder names',()=>{
 assert.equal(parseAmount('100.25'),10025);assert.equal(parseAmount('1.01'),101);
 for(const amount of ['0','-1','1.001','1e3','10000.01',100])assert.throws(()=>parseAmount(amount));
 assert.throws(()=>receivingAccounts(JSON.stringify(accounts.map(a=>({...a,name:''})))));
 assert.throws(()=>receivingAccounts(JSON.stringify([accounts[0],accounts[0],accounts[2]])));
});
test('five-step flow assigns accounts, waits for evidence and credits once with a balanced journal',()=>fixture(async store=>{
 const key=randomUUID(),first=store.create('123','100.25',key);assert.equal(first.phone,accounts[0].phone);assert.equal(first.holder,'Holder 1');assert.equal(first.status,'awaiting_reference');assert.equal(store.wallet('123').balanceMinor,0);
 assert.equal(store.create('123','100.25',key).id,first.id);assert.throws(()=>store.create('123','101',key));
 assert.equal(store.create('456','50',randomUUID()).phone,accounts[1].phone);assert.equal(store.create('789','50',randomUUID()).phone,accounts[2].phone);
 assert.throws(()=>store.review('999',first.id,'approved',proof(first)),/pending/);
 const row=store.submitReference('123',first.id,' actual123 ');assert.equal(row.status,'pending');assert.equal(store.wallet('123').balanceMinor,0);
 assert.throws(()=>store.review('999',row.id,'approved',{...proof(row),received:false}),/actual incoming/);
 for(const wrong of [{amount:'101'},{phone:accounts[1].phone},{reference:'OTHER123'}])assert.throws(()=>store.review('999',row.id,'approved',{...proof(row),...wrong}),/must match/);
 assert.throws(()=>store.review('123',row.id,'approved',proof(row)),/own deposits/);
 store.review('999',row.id,'approved',proof(row));store.review('888',row.id,'approved',proof(row));
 assert.equal(store.wallet('123').balanceMinor,10025);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM ledger').get().n,2);assert.equal(store.db.prepare('SELECT SUM(delta_minor) AS n FROM ledger').get().n,0);
 assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='approved'").get().n,1);
 assert.throws(()=>store.db.exec('UPDATE ledger SET delta_minor=1'),/immutable/);
}));
test('references are global, ownership is enforced, and rejected deposits do not credit',()=>fixture(async store=>{
 const a=pending(store),b=store.create('456','100.25',randomUUID());
 assert.throws(()=>store.submitReference('456',b.id,'actual123'),/already recorded/);
 assert.throws(()=>store.submitReference('456',a.id,'OTHER123'),/not found/);
 assert.throws(()=>store.cancel('456',a.id),/not found/);
 store.review('999',a.id,'rejected',{reason:'No incoming transfer found'});assert.equal(store.wallet('123').balanceMinor,0);
 assert.throws(()=>store.review('999',a.id,'approved',proof(a)),/pending/);
 assert.equal(store.wallet('789').deposits.length,0);
}));
test('approval rolls back the status, credit, and audit together when a journal write fails',()=>fixture(async store=>{
 const row=pending(store);store.db.exec("CREATE TRIGGER fail_clearing BEFORE INSERT ON ledger WHEN NEW.user='@telebirr-clearing' BEGIN SELECT RAISE(ABORT,'injected write failure'); END;");
 assert.throws(()=>store.review('999',row.id,'approved',proof(row)),/injected/);assert.equal(store.row(row.id).status,'pending');assert.equal(store.wallet('123').balanceMinor,0);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM ledger').get().n,0);
 store.db.exec('DROP TRIGGER fail_clearing');store.review('999',row.id,'approved',proof(row));assert.equal(store.wallet('123').balanceMinor,10025);
}));
test('two database connections and a restart cannot credit the same request twice',()=>fixture(async store=>{
 const row=pending(store);const other=new ManualPayments({file:store.db.location(),accounts});
 try{store.review('999',row.id,'approved',proof(row));other.review('888',row.id,'approved',proof(row));assert.equal(other.wallet('123').balanceMinor,10025);}finally{other.close();}
}));
test('cancelled unpaid requests never credit and pending limits stop repeated open requests',()=>fixture(async store=>{
 const row=store.create('123','20',randomUUID());store.cancel('123',row.id);assert.throws(()=>store.submitReference('123',row.id,'NEWREF123'));
 for(let n=0;n<5;n++)store.create('123','20',randomUUID());assert.throws(()=>store.create('123','20',randomUUID()),/five open/);assert.equal(store.wallet('123').balanceMinor,0);
}));
test('backup script captures committed credits from a live WAL database',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pu-etb-backup-'));let store;
 try{store=new ManualPayments({file:join(dir,'data','manual-payments.sqlite'),accounts});const row=pending(store);store.review('999',row.id,'approved',proof(row));
 execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/backup-manual-payments.mjs',import.meta.url))],{cwd:dir,stdio:'pipe'});
 const [backup]=await readdir(join(dir,'data','backups'));const copy=new DatabaseSync(join(dir,'data','backups',backup),{readOnly:true});try{assert.equal(copy.prepare("SELECT SUM(delta_minor) AS n FROM ledger WHERE user='123'").get().n,10025);assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{copy.close();}
 }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});
