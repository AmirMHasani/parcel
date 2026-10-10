// Agency plan, Phase 1: migration, accounts, keys, rate limit, rotation, and the AGENCY_ENABLED gate.
import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const root=process.cwd();let sqlite,objects;
const environment={};globalThis.__parcelEnv=environment;
const modules=new Map();
function load(file){file=path.resolve(root,file);if(modules.has(file))return modules.get(file);let source=fs.readFileSync(file,'utf8');source=source.replace(/from\s+(['"])([^'"]+)\1/g,(match,q,spec)=>{if(spec==='cloudflare:workers')return 'from '+JSON.stringify('data:text/javascript,export const env=globalThis.__parcelEnv;');if(spec.startsWith('.')){let p=path.resolve(path.dirname(file),spec);if(p.endsWith('.mjs'))return 'from '+JSON.stringify('file://'+p);if(!p.endsWith('.ts'))p+='.ts';return 'from '+JSON.stringify(load(p));}return match;});const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');modules.set(file,url);return url;}
const agency=await import(load('lib/agency.ts')),jobs=await import(load('lib/jobs.ts')),launch=await import(load('lib/launch.ts'));
const session=await import(load('app/api/agency/session/route.ts')),rotate=await import(load('app/api/agency/rotate/route.ts'));
function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
const migrations=fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort();
const apply=files=>{for(const p of files)sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8').replaceAll('--> statement-breakpoint',''));};
const origin='https://parcel.test';
const request=(key,ip='1.2.3.4',init={})=>new Request(origin+'/api/agency/session',{...init,headers:{'cf-connecting-ip':ip,...(key===undefined?{}:{'x-agency-key':key}),...(init.headers||{})}});
const columns=table=>sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
beforeEach(()=>{sqlite=new DatabaseSync(':memory:');apply(migrations);environment.DB={prepare:statement,async batch(s){sqlite.exec('BEGIN');try{const results=[];for(const v of s)results.push(v.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};objects=new Map();environment.BUCKET={async put(key,data,opts={}){objects.set(key,{data:Buffer.from(data),...opts});},async head(key){return objects.has(key)?{size:1}:null;},async get(key){const v=objects.get(key);return v?{json:async()=>JSON.parse(v.data.toString())}:null;},async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])objects.delete(k);},async list({prefix}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}};process.env.AGENCY_ENABLED='1';process.env.EXPORT_SIGNING_SECRET='test-secret-test-secret-test-secret';});

test('migration 0005 creates the agency tables and export columns from scratch',()=>{
 assert.deepEqual(columns('agency_accounts'),['id','key_hash','email','stripe_customer','stripe_subscription','stripe_session','status','period_start','period_end','status_checked_at','cancel_at_period_end','suspended','created','updated']);
 assert.deepEqual(columns('invite_codes'),['code','account_id','used_at','created']);
 assert.deepEqual(columns('usage_cycles'),['account_id','period_start','used']);
 for(const c of ['agency_id','priority','client_name'])assert(columns('exports').includes(c),c);
 const indexes=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r=>r.name);
 for(const i of ['agency_accounts_key_hash_unique','agency_accounts_status','exports_agency'])assert(indexes.includes(i),i);
 assert.equal(migrations.at(-1),'0005_agency_plan.sql');
});

test('migration 0005 upgrades an existing database without touching existing exports',()=>{
 sqlite=new DatabaseSync(':memory:');apply(migrations.filter(m=>!m.startsWith('0005')));
 const now=Date.now();
 sqlite.prepare("INSERT INTO exports(id,key_hash,owner,ip,hash,manifest,state,total,max_bytes,amount,next_run,created,expires,idempotency) VALUES('job1','k','o','ip','h','m','complete',1,300000000,0,?,?,?,'idem1')").run(now,now,now+86400000);
 apply(migrations.filter(m=>m.startsWith('0005')));
 const row=sqlite.prepare('SELECT * FROM exports WHERE id=?').get('job1');
 assert.equal(row.state,'complete');assert.equal(row.priority,0);assert.equal(row.agency_id,null);assert.equal(row.client_name,null);
 // usage_cycles enforces one row per account and period
 sqlite.prepare('INSERT INTO usage_cycles(account_id,period_start,used) VALUES(?,?,?)').run('a',1,1);
 assert.throws(()=>sqlite.prepare('INSERT INTO usage_cycles(account_id,period_start,used) VALUES(?,?,?)').run('a',1,2));
});

test('existing export creation still works with the new columns',async()=>{
 const body={attempt:crypto.randomUUID(),key:'a'.repeat(64),items:[{handle:'p',title:'Product',sku:'SKU',position:1,url:'https://cdn.shopify.com/a.png'}],options:{mode:'sku',folders:true,manifest:true}};
 const job=await jobs.createJob(new Request(origin,{headers:{'cf-connecting-ip':'1.2.3.4'}}),body);
 const row=sqlite.prepare('SELECT priority,agency_id,client_name FROM exports WHERE id=?').get(job.id);
 assert.deepEqual({...row},{priority:0,agency_id:null,client_name:null});
});

test('the plan is invisible while AGENCY_ENABLED is off',async()=>{
 delete process.env.AGENCY_ENABLED;
 assert.equal(launch.agencyEnabled(),false);
 const {key}=await agency.createAccount({status:'active'});
 const response=await session.GET(request(key));
 assert.equal(response.status,404);
 process.env.AGENCY_ENABLED='1';
 assert.equal((await session.GET(request(key))).status,200);
});

test('accounts are found by key, never by hash, and the summary hides secrets',async()=>{
 const {id,key}=await agency.createAccount({email:'ops@example.com',status:'active',periodStart:1000,periodEnd:Date.now()+86400000});
 assert.match(key,/^[a-f0-9]{64}$/);
 assert.equal(sqlite.prepare('SELECT key_hash FROM agency_accounts WHERE id=?').get(id).key_hash.length,64);
 assert.notEqual(sqlite.prepare('SELECT key_hash FROM agency_accounts WHERE id=?').get(id).key_hash,key);
 const account=await agency.findAccount(request(key));
 assert.equal(account.id,id);
 sqlite.prepare('INSERT INTO usage_cycles(account_id,period_start,used) VALUES(?,?,?)').run(id,1000,46);
 const body=await (await session.GET(request(key))).json();
 assert.deepEqual(Object.keys(body).sort(),['canExport','cancelAtPeriodEnd','email','id','limit','periodEnd','periodStart','remaining','status','used','warning'].sort());
 assert.equal(body.used,46);assert.equal(body.remaining,4);assert.equal(body.warning,true);assert.equal(body.canExport,true);assert.equal(body.status,'active');
 assert.equal(JSON.stringify(body).includes(key),false);
 // using the stored hash as if it were a key must fail
 const hash=sqlite.prepare('SELECT key_hash FROM agency_accounts WHERE id=?').get(id).key_hash;
 await assert.rejects(agency.findAccount(request(hash)),e=>e.status===404);
});

test('pending, expired-period and suspended accounts cannot export',async()=>{
 const pending=await agency.createAccount();
 assert.equal((await agency.summary(await agency.findAccount(request(pending.key)))).canExport,false);
 const expired=await agency.createAccount({status:'active',periodStart:1,periodEnd:Date.now()-1});
 assert.equal((await agency.summary(await agency.findAccount(request(expired.key)))).canExport,false);
 const suspended=await agency.createAccount({status:'active'});
 sqlite.prepare('UPDATE agency_accounts SET suspended=1 WHERE id=?').run(suspended.id);
 const s=await agency.summary(await agency.findAccount(request(suspended.key)));
 assert.equal(s.canExport,false);assert.equal(s.status,'suspended');
});

test('missing key is 401, wrong keys are 404 and become 429 after ten failures per client per day',async()=>{
 await assert.rejects(agency.findAccount(request(undefined)),e=>e.status===401);
 for(let i=0;i<10;i++)await assert.rejects(agency.findAccount(request('b'.repeat(64))),e=>e.status===404);
 await assert.rejects(agency.findAccount(request('b'.repeat(64))),e=>e.status===429);
 await assert.rejects(agency.findAccount(request('not-a-key')),e=>e.status===429);
 // a different client is unaffected, and a valid key still works for the limited client
 await assert.rejects(agency.findAccount(request('b'.repeat(64),'9.9.9.9')),e=>e.status===404);
 const {key}=await agency.createAccount({status:'active'});
 assert.equal((await agency.findAccount(request(key))).status,'active');
});

test('rotating the key invalidates the old one and refuses a stale rotation',async()=>{
 const {id,key}=await agency.createAccount({status:'active'});
 const response=await rotate.POST(request(key,'1.2.3.4',{method:'POST'}));
 assert.equal(response.status,200);
 const {key:next}=await response.json();
 assert.match(next,/^[a-f0-9]{64}$/);assert.notEqual(next,key);
 await assert.rejects(agency.findAccount(request(key)),e=>e.status===404);
 assert.equal((await agency.findAccount(request(next))).id,id);
 // a rotation based on the old (stale) account row must not succeed
 const stale={id,key_hash:sqlite.prepare('SELECT key_hash FROM agency_accounts WHERE id=?').get(id).key_hash};
 await agency.rotateKey(stale);
 await assert.rejects(agency.rotateKey(stale),e=>e.status===409);
 // cross-site rotation requests are refused
 assert.equal((await rotate.POST(request(next,'1.2.3.4',{method:'POST',headers:{'sec-fetch-site':'cross-site'}}))).status,400);
});
