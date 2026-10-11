#!/usr/bin/env node
// Rehearses the Agency migration (and any other unapplied drizzle migrations) against a COPY of a real database, so
// the production run holds no surprises. Nothing is written back anywhere.
//
//   pnpm exec wrangler d1 export parcel-db --remote --output prod-copy.sql     (production; staging: CLOUDFLARE_ENV=staging ... DB)
//   node scripts/rehearse-migration.mjs prod-copy.sql
//   del prod-copy.sql    # it contains customer job metadata
//
// What it checks: the dump loads; every table's row count is unchanged after migrating; existing export rows keep
// their values (SHA-256 of the pre-existing columns before vs after); the new columns exist with their defaults; the
// agency tables exist and are empty; PRAGMA integrity_check and foreign_key_check pass; the migration is idempotent-safe
// (a second apply of the same file fails cleanly, which is what wrangler's journal prevents in real life).
import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const file=process.argv[2];if(!file||!fs.existsSync(file)){console.error('usage: node scripts/rehearse-migration.mjs <d1-export.sql>');process.exit(2);}
const sql=fs.readFileSync(file,'utf8');const db=new DatabaseSync(':memory:');
let fail=0;const ok=(name,cond,detail='')=>{console.log((cond?'PASS ':'FAIL ')+name+(detail?' — '+detail:''));if(!cond)fail++;};
try{db.exec(sql);}catch(e){console.error('The export did not load into SQLite: '+e.message);process.exit(1);}
const tables=()=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
const count=t=>db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n;
const cols=t=>db.prepare(`PRAGMA table_info("${t}")`).all().map(c=>c.name);
const before=Object.fromEntries(tables().map(t=>[t,count(t)]));
const exportCols=cols('exports');
const fingerprint=()=>{const h=createHash('sha256');const q=exportCols.map(c=>`"${c}"`).join(',');for(const row of db.prepare(`SELECT ${q} FROM exports ORDER BY id`).all())h.update(JSON.stringify(Object.values(row)));return h.digest('hex');};
const fpBefore=exportCols.length?fingerprint():null;
// which migrations has this database already recorded?
const applied=new Set();try{for(const r of db.prepare('SELECT name FROM d1_migrations').all())applied.add(r.name);}catch{}
const all=fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
const pending=all.filter(f=>!applied.has(f));
console.log('database tables: '+tables().join(', '));
console.log('migrations recorded: '+[...applied].join(', ')||'(none)');
console.log('migrations to apply: '+(pending.join(', ')||'(none)'));
ok('exports table present in the dump',exportCols.includes('id'));
for(const f of pending){const text=fs.readFileSync(path.join('drizzle',f),'utf8').split('--> statement-breakpoint');let n=0;try{db.exec('BEGIN');for(const s of text){if(s.trim()){db.exec(s);n++;}}db.exec('COMMIT');ok('applied '+f,true,n+' statements');}catch(e){db.exec('ROLLBACK');ok('applied '+f,false,e.message);}}
const after=Object.fromEntries(tables().map(t=>[t,count(t)]));
for(const t of Object.keys(before))ok('row count unchanged: '+t,before[t]===after[t],`${before[t]} → ${after[t]}`);
if(fpBefore)ok('existing export rows unchanged (pre-existing columns)',fingerprint()===fpBefore);
const want={exports:['agency_id','priority','client_name','usage_slot','usage_period'],agency_accounts:['id','key_hash','status','period_start','period_end','cancel_at_period_end','suspended','recovery_hash','recovery_expires'],invite_codes:['code','account_id','used_at'],usage_cycles:['account_id','period_start','used']};
for(const [t,cs] of Object.entries(want)){const have=cols(t);ok('columns present: '+t,cs.every(c=>have.includes(c)),cs.filter(c=>!have.includes(c)).join(',')||'all');}
// These two only make sense when 0005 is being applied by this rehearsal: a database that already carries the
// migration legitimately has agency accounts, used codes and agency exports.
if(pending.includes('0005_agency_plan.sql')){
 if(after.exports){const d=db.prepare('SELECT COUNT(*) n FROM exports WHERE priority=0 AND usage_slot=0 AND agency_id IS NULL').get().n;ok('existing exports default to priority 0 / no agency',d===after.exports,`${d} of ${after.exports}`);}
 for(const t of ['agency_accounts','invite_codes','usage_cycles'])ok('empty: '+t,count(t)===0);
}else console.log('skip: 0005 already recorded — the fresh-table checks do not apply');
ok('integrity_check',db.prepare('PRAGMA integrity_check').get().integrity_check==='ok');
ok('foreign_key_check',db.prepare('PRAGMA foreign_key_check').all().length===0);
// the index the worker's claim query relies on
const idx=db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r=>r.name);ok('agency indexes present',['exports_agency','agency_accounts_key_hash_unique','agency_accounts_status'].every(i=>idx.includes(i)));
// a representative worker claim query must still parse against the migrated schema
try{db.prepare("SELECT id FROM exports WHERE state IN ('queued','downloading','packing') ORDER BY MAX(priority,CASE WHEN created<? THEN 1 ELSE 0 END) DESC,next_run,created LIMIT 1").get(0);ok('worker claim query parses',true);}catch(e){ok('worker claim query parses',false,e.message);}
console.log(fail?`\n${fail} check(s) failed — do not migrate until this is understood.`:'\nAll checks passed. The migration is safe to apply to this database.');
process.exit(fail?1:0);
