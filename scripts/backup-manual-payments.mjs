import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
const source=resolve('data/manual-payments.sqlite');
if(!statSync(source).isFile())throw Error('Manual payment database does not exist.');
const directory=resolve('data/backups');mkdirSync(directory,{recursive:true});
const target=join(directory,'manual-payments-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
const db=new DatabaseSync(source,{readOnly:true,timeout:5000});
try{db.prepare('VACUUM INTO ?').run(target);}finally{db.close();}
if(process.platform!=='win32')chmodSync(target,0o600);
console.log('Consistent SQLite backup created: '+target);
