#!/usr/bin/env node
// Operator helper for the Agency plan beta. Prints a fresh agency key with the SQL that creates its account,
// or the SQL for an invite code. Run the SQL with wrangler, e.g.
//   node scripts/agency-admin.mjs account you@example.com
//   pnpm exec wrangler d1 execute parcel-staging-db --remote --command "<printed SQL>"
// The key itself is shown once here and never stored; give it to the agency privately.
import {createHash,randomBytes,randomUUID} from 'node:crypto';
const [command,arg]=process.argv.slice(2);
const q=v=>"'"+String(v).replace(/'/g,"''")+"'";
if(command==='account'){
 const key=randomBytes(32).toString('hex'),hash=createHash('sha256').update(key).digest('hex'),now=Date.now(),id=randomUUID();
 const email=arg?q(arg):'NULL';
 console.log('Agency key (share privately, shown once):\n  '+key+'\n');
 console.log('SQL to create an ACTIVE account for the next 30 days:');
 console.log(`INSERT INTO agency_accounts(id,key_hash,email,status,period_start,period_end,created,updated) VALUES(${q(id)},${q(hash)},${email},'active',${now},${now+30*86400000},${now},${now});`);
}else if(command==='code'){
 if(!arg||!/^[A-Z0-9-]{6,40}$/.test(arg)){console.error('Usage: agency-admin.mjs code AGENCY-BETA  (uppercase letters, digits, dashes)');process.exit(1);}
 console.log(`INSERT INTO invite_codes(code,created) VALUES(${q(arg)},${Date.now()});`);
}else{
 console.error('Usage:\n  node scripts/agency-admin.mjs account [email]\n  node scripts/agency-admin.mjs code AGENCY-BETA');process.exit(1);
}
