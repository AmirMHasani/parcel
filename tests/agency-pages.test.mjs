// Agency plan, Phase 5: key recovery by email (token → new key), the export-history endpoint, the config flag, the
// pricing copy (verbatim), and the browser-side key storage helpers.
import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const root=process.cwd();let sqlite,sent;
const environment={};globalThis.__parcelEnv=environment;
const modules=new Map();
function load(file){file=path.resolve(root,file);if(modules.has(file))return modules.get(file);let source=fs.readFileSync(file,'utf8');source=source.replace(/from\s+(['"])([^'"]+)\1/g,(match,q,spec)=>{if(spec==='cloudflare:workers')return 'from '+JSON.stringify('data:text/javascript,export const env=globalThis.__parcelEnv;');if(spec.startsWith('.')){let p=path.resolve(path.dirname(file),spec);if(p.endsWith('.mjs'))return 'from '+JSON.stringify('file://'+p);if(!p.endsWith('.ts'))p+='.ts';return 'from '+JSON.stringify(load(p));}return match;});const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');modules.set(file,url);return url;}
const agency=await import(load('lib/agency.ts')),jobs=await import(load('lib/jobs.ts'));
const recover=await import(load('app/api/agency/recover/route.ts')),redeem=await import(load('app/api/agency/recover/redeem/route.ts')),exportsRoute=await import(load('app/api/agency/exports/route.ts')),config=await import(load('app/api/config/route.ts'));
const client=await import('../lib/client-api.mjs');
function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
const origin='https://parcel.test';
const post=(path,body,headers={})=>new Request(origin+path,{method:'POST',headers:{'cf-connecting-ip':'1.2.3.4','content-type':'application/json',...headers},body:JSON.stringify(body)});
const get=(path,headers={})=>new Request(origin+path,{headers:{'cf-connecting-ip':'1.2.3.4',...headers}});
const period=()=>({periodStart:Date.now()-86400000,periodEnd:Date.now()+29*86400000});
beforeEach(()=>{sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8').replaceAll('--> statement-breakpoint',''));environment.DB={prepare:statement,async batch(s){sqlite.exec('BEGIN');try{const results=[];for(const v of s)results.push(v.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};environment.BUCKET={async put(){},async head(){return null;},async get(){return null;},async delete(){},async list(){return {objects:[]};}};
 sent=[];globalThis.fetch=async(url,opts)=>{if(String(url).startsWith('https://api.resend.com/')){sent.push(JSON.parse(opts.body));return Response.json({id:'em_1'});}return Response.json({});};
 process.env.AGENCY_ENABLED='1';process.env.RESEND_API_KEY='re_fixture';process.env.EMAIL_FROM='Parcel <support@parcel.test>';process.env.PUBLIC_SITE_URL=origin;process.env.EXPORT_SIGNING_SECRET='a'.repeat(64);process.env.STRIPE_SECRET_KEY='test-fixture';process.env.PAYMENTS_ENABLED='1';process.env.POLICIES_APPROVED='1';process.env.SUPPORT_EMAIL='support@parcel.test';process.env.BACKGROUND_EXPORTS='1';});

test('recovery emails a one-hour link to a matching account and says the same thing to everyone else',async()=>{
 const {id,key}=await agency.createAccount({status:'active',email:'Owner@Agency.test',...period()});
 let r=await recover.POST(post('/api/agency/recover',{email:'nobody@agency.test'}));assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});assert.equal(sent.length,0);
 r=await recover.POST(post('/api/agency/recover',{email:'owner@agency.test'}));assert.equal(r.status,200);assert.equal(sent.length,1);
 assert.equal(sent[0].to,'owner@agency.test');assert.match(sent[0].text,/\/agency\/account\?recover=[a-f0-9]{64}/);assert.doesNotMatch(sent[0].text,new RegExp(key));
 const row=sqlite.prepare('SELECT recovery_hash,recovery_expires,key_hash FROM agency_accounts WHERE id=?').get(id);
 assert.equal(row.recovery_hash.length,64);assert(row.recovery_expires>Date.now()+3500000);
 // the current key keeps working until the link is used
 assert.equal((await agency.findAccount(get('/x',{'x-agency-key':key}))).id,id);
 assert.equal((await recover.POST(post('/api/agency/recover',{email:'not-an-email'}))).status,400);
 delete process.env.RESEND_API_KEY;assert.equal((await recover.POST(post('/api/agency/recover',{email:'owner@agency.test'}))).status,503);
});

test('the recovery link issues a new key once; the old key and the used or expired link stop working',async()=>{
 const {id,key}=await agency.createAccount({status:'active',email:'owner@agency.test',...period()});
 await recover.POST(post('/api/agency/recover',{email:'owner@agency.test'}));
 const token=sent[0].text.match(/recover=([a-f0-9]{64})/)[1];
 const r=await redeem.POST(post('/api/agency/recover/redeem',{token}));assert.equal(r.status,200);
 const body=await r.json();assert.match(body.key,/^[a-f0-9]{64}$/);assert.notEqual(body.key,key);assert.equal(body.account.id,id);assert.equal(body.account.status,'active');
 assert.equal((await agency.findAccount(get('/x',{'x-agency-key':body.key}))).id,id);
 await assert.rejects(agency.findAccount(get('/x',{'x-agency-key':key})),e=>e.status===404);
 assert.equal((await redeem.POST(post('/api/agency/recover/redeem',{token}))).status,404);
 assert.equal((await redeem.POST(post('/api/agency/recover/redeem',{token:'not-a-token'}))).status,404);
 // expired
 await recover.POST(post('/api/agency/recover',{email:'owner@agency.test'}));const token2=sent[1].text.match(/recover=([a-f0-9]{64})/)[1];
 sqlite.prepare('UPDATE agency_accounts SET recovery_expires=? WHERE id=?').run(Date.now()-1,id);
 assert.equal((await redeem.POST(post('/api/agency/recover/redeem',{token:token2}))).status,404);
 // pending and suspended accounts cannot be recovered
 const pending=await agency.createAccount({email:'p@agency.test'});sent=[];await recover.POST(post('/api/agency/recover',{email:'p@agency.test'}));assert.equal(sent.length,0);
 sqlite.prepare('UPDATE agency_accounts SET suspended=1 WHERE id=?').run(id);await recover.POST(post('/api/agency/recover',{email:'owner@agency.test'}));assert.equal(sent.length,0);
});

test('the export history lists only the account\'s exports for the period, newest first, with file names',async()=>{
 const a=await agency.createAccount({status:'active',...period()}),other=await agency.createAccount({status:'active',...period()});
 const body=(client,i)=>({attempt:crypto.randomUUID(),key:'a'.repeat(64),items:[{handle:'p',title:'P',sku:'S',position:1,url:'https://cdn.shopify.com/a.png?i='+i}],options:{mode:'sku',folders:true,manifest:true},clientName:client});
 const first=await jobs.createJob(get('/',{'x-agency-key':a.key}),body('Acme Store',1));
 sqlite.prepare('UPDATE exports SET created=created-1000 WHERE id=?').run(first.id);
 const second=await jobs.createJob(get('/',{'x-agency-key':a.key}),body(undefined,2));
 await jobs.createJob(get('/',{'x-agency-key':other.key}),body('Other Co',3));
 const old=await jobs.createJob(get('/',{'x-agency-key':a.key}),body('Old',4));sqlite.prepare('UPDATE exports SET created=? WHERE id=?').run(Date.now()-40*86400000,old.id);
 const r=await exportsRoute.GET(get('/api/agency/exports',{'x-agency-key':a.key}));assert.equal(r.status,200);
 const {exports:list}=await r.json();
 assert.deepEqual(list.map(e=>e.id),[second.id,first.id]);
 assert.equal(list[0].fileName,'export-'+second.id.slice(0,8)+'-images.zip');assert.equal(list[1].fileName,'acme-store-images.zip');assert.equal(list[1].clientName,'Acme Store');assert.equal(list[1].countsTowardLimit,true);
 assert.equal((await exportsRoute.GET(get('/api/agency/exports'))).status,401);
});

test('config tells the page whether the plan is on',async()=>{
 assert.equal((await (await config.GET()).json()).agency,true);delete process.env.AGENCY_ENABLED;assert.equal((await (await config.GET()).json()).agency,false);
});

test('pricing page carries the approved Agency copy word for word, shown as request-access, not signup',()=>{
 const src=fs.readFileSync('app/pricing/page.tsx','utf8');
 for(const text of ['>Agency</h2>','For migration agencies and freelancers. All your clients, one flat price.','<li>50 exports per month</li>','<li>Priority processing</li>','<li>White-label ZIPs and reports</li>','<li>Cancel anytime</li>','Beta: request access','mailto:'])assert(src.includes(text),text);
 assert.doesNotMatch(src,/There is no subscription/);
 assert.doesNotMatch(src,/href="\/agency"/); // no public link to the unlisted page
 for(const f of ['app/terms/page.tsx','app/refunds/page.tsx','app/support/page.tsx'])assert.match(fs.readFileSync(f,'utf8'),/Agency/);
});

test('browser key storage helpers validate, save, read and build headers',()=>{
 const store=new Map();const read=k=>store.get(k)??null,write=(k,v)=>store.set(k,v),remove=k=>store.delete(k);
 assert.equal(client.readAgency(read),null);
 assert.equal(client.saveAgency({key:'b'.repeat(64),pending:true},write),true);
 assert.deepEqual({key:client.readAgency(read).key,pending:client.readAgency(read).pending},{key:'b'.repeat(64),pending:true});
 write(client.AGENCY_STORAGE,JSON.stringify({key:'short'}));assert.equal(client.readAgency(read),null);
 client.clearAgency(remove);assert.equal(client.readAgency(read),null);
});
