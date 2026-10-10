// Agency plan, Phase 4: agency exports are claimed first (with a 10-minute fairness rule for one-time exports), queue
// positions reflect that, and agency ZIPs carry the client's name with a download header safe for any script.
import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const root=process.cwd();let sqlite,objects;
const environment={};globalThis.__parcelEnv=environment;
const modules=new Map();
function load(file){file=path.resolve(root,file);if(modules.has(file))return modules.get(file);let source=fs.readFileSync(file,'utf8');source=source.replace(/from\s+(['"])([^'"]+)\1/g,(match,q,spec)=>{if(spec==='cloudflare:workers')return 'from '+JSON.stringify('data:text/javascript,export const env=globalThis.__parcelEnv;');if(spec.startsWith('.')){let p=path.resolve(path.dirname(file),spec);if(p.endsWith('.mjs'))return 'from '+JSON.stringify('file://'+p);if(!p.endsWith('.ts'))p+='.ts';return 'from '+JSON.stringify(load(p));}return match;});const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');modules.set(file,url);return url;}
const agency=await import(load('lib/agency.ts')),jobs=await import(load('lib/jobs.ts')),worker=await import(load('lib/job-worker.ts')),capacity=await import(load('lib/capacity.ts'));
const names=await import('../lib/zip-name.mjs');
function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
const origin='https://parcel.test',good='https://cdn.shopify.com/a.png';
const request=(headers={},ip='1.2.3.4')=>new Request(origin,{headers:{'cf-connecting-ip':ip,...headers}});
const body=(n=2,extra={})=>({attempt:crypto.randomUUID(),key:'a'.repeat(64),items:Array.from({length:n},(_,i)=>({handle:'p',title:'Product',sku:'SKU',position:i+1,url:good+'?i='+i})),options:{mode:'sku',folders:true,manifest:true},...extra});
const active=async()=>agency.createAccount({status:'active',periodStart:Date.now()-86400000,periodEnd:Date.now()+29*86400000});
const row=id=>sqlite.prepare('SELECT * FROM exports WHERE id=?').get(id);
let ipCounter=10;const nextIp=()=>'10.0.0.'+(ipCounter++);
beforeEach(()=>{sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8').replaceAll('--> statement-breakpoint',''));environment.DB={prepare:statement,async batch(s){sqlite.exec('BEGIN');try{const results=[];for(const v of s)results.push(v.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};objects=new Map();environment.BUCKET={async put(key,data,opts={}){const bytes=data instanceof ReadableStream?Buffer.from(await new Response(data).arrayBuffer()):Buffer.from(data);objects.set(key,{data:bytes,...opts});},async head(key){let v=objects.get(key);return v?{size:v.data.length,customMetadata:v.customMetadata}:null;},async get(key,opts={}){let v=objects.get(key);if(!v)return null;if(opts.range)v={...v,data:v.data.subarray(opts.range.offset,opts.range.offset+opts.range.length)};return {size:v.data.length,customMetadata:v.customMetadata,body:new Response(v.data).body,arrayBuffer:async()=>v.data.buffer.slice(v.data.byteOffset,v.data.byteOffset+v.data.byteLength),json:async()=>JSON.parse(v.data.toString())};},async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])objects.delete(k);},async list({prefix,limit}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(key=>({key}))};}};
 globalThis.fetch=async(url)=>{if(String(url).startsWith('https://api.stripe.com/'))return Response.json({});return new Response(new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]),{headers:{'Content-Type':'image/png'}});};
 process.env.EXPORT_SIGNING_SECRET='a'.repeat(64);process.env.STRIPE_SECRET_KEY='test-fixture';process.env.PAYMENTS_ENABLED='1';process.env.POLICIES_APPROVED='1';process.env.SUPPORT_EMAIL='support@example.test';process.env.AGENCY_ENABLED='1';process.env.STRIPE_AGENCY_PRICE_ID='price_fixture';process.env.MAX_CONCURRENT_JOBS='1';delete process.env.RESEND_API_KEY;delete process.env.PUBLIC_SITE_URL;});

test('the worker claims an agency export before older one-time exports',async()=>{
 const {key}=await active();
 const a=await jobs.createJob(request({},nextIp()),body(1)),b=await jobs.createJob(request({},nextIp()),body(1));
 sqlite.prepare('UPDATE exports SET created=created-5000,next_run=next_run-5000').run(); // one-time exports are clearly older
 const c=await jobs.createJob(request({'x-agency-key':key}),body(1));
 await worker.tick();
 assert.equal(row(c.id).completed,1);assert.equal(row(a.id).completed,0);assert.equal(row(b.id).completed,0);
 // the agency export keeps priority until its ZIP is built; then the one-time exports take turns, oldest first
 for(let i=0;i<5&&row(c.id).state!=='complete';i++)await worker.tick();assert.equal(row(c.id).state,'complete');assert.equal(row(a.id).completed,0);
 await worker.tick();assert.equal(row(a.id).completed,1);assert.equal(row(b.id).completed,0);
});

test('a one-time export that has waited ten minutes is treated as priority too',async()=>{
 const {key}=await active();
 const old=await jobs.createJob(request({},nextIp()),body(1));
 sqlite.prepare('UPDATE exports SET created=?,next_run=? WHERE id=?').run(Date.now()-capacity.PRIORITY_AGING_MS-1000,Date.now()-capacity.PRIORITY_AGING_MS-1000,old.id);
 const fresh=await jobs.createJob(request({'x-agency-key':key}),body(1));
 assert.equal(capacity.effectivePriority(row(old.id)),1);assert.equal(capacity.effectivePriority(row(fresh.id)),1);
 await worker.tick();
 assert.equal(row(old.id).completed,1);assert.equal(row(fresh.id).completed,0);
});

test('queue positions follow the same order the worker will use',async()=>{
 const {key}=await active();
 const a=await jobs.createJob(request({},nextIp()),body(1)),b=await jobs.createJob(request({},nextIp()),body(1));
 sqlite.prepare('UPDATE exports SET created=created-5000,next_run=next_run-5000').run();
 const c=await jobs.createJob(request({'x-agency-key':key}),body(1));
 assert.equal((await jobs.status(row(c.id))).queuePosition,1);
 assert.equal((await jobs.status(row(a.id))).queuePosition,2);
 assert.equal((await jobs.status(row(b.id))).queuePosition,3);
 const s=await jobs.status(row(c.id));assert.equal(s.priority,1);assert.equal(s.agency,true);assert.equal(typeof s.created,'number');
});

test('agency ZIPs are named after the client, never after Parcel',async()=>{
 const {key}=await active();
 const named=await jobs.createJob(request({'x-agency-key':key}),body(1,{clientName:'  Acme   Store! ©2026 '}));
 assert.equal(row(named.id).client_name,'Acme Store 2026');
 assert.equal((await jobs.status(row(named.id))).fileName,'acme-store-2026-images.zip');
 const unnamed=await jobs.createJob(request({'x-agency-key':key}),body(1));
 assert.equal((await jobs.status(row(unnamed.id))).fileName,'export-'+unnamed.id.slice(0,8)+'-images.zip');
 const plain=await jobs.createJob(request({},nextIp()),body(1,{clientName:'Ignored For One-Time'}));
 assert.equal(row(plain.id).client_name,null);assert.equal((await jobs.status(row(plain.id))).fileName,'parcel-'+plain.id+'.zip');
 assert.equal(names.cleanClientName('x'.repeat(100)).length,60);assert.equal(names.cleanClientName('   '),null);assert.equal(names.cleanClientName(42),null);
 assert.equal(names.zipFileName({id:'abcdef12-0000',agency_id:'x',client_name:'Café Déjà Vu'}),'café-déjà-vu-images.zip');
 assert.equal(names.zipFileName({id:'abcdef12-0000',agency_id:'x',client_name:'東京 ショップ'}),'東京-ショップ-images.zip');
});

test('the download header has an ASCII fallback and a UTF-8 name for every script',()=>{
 assert.equal(names.contentDisposition('acme-store-images.zip'),'attachment; filename="acme-store-images.zip"');
 assert.equal(names.contentDisposition('parcel-abc.zip'),'attachment; filename="parcel-abc.zip"');
 assert.equal(names.contentDisposition('café-déjà-vu-images.zip'),"attachment; filename=\"cafe-deja-vu-images.zip\"; filename*=UTF-8''caf%C3%A9-d%C3%A9j%C3%A0-vu-images.zip");
 const cjk=names.contentDisposition('東京-ショップ-images.zip');
 assert.match(cjk,/^attachment; filename="export-images\.zip"; filename\*=UTF-8''%E6%9D%B1%E4%BA%AC-/);
 assert.doesNotMatch(names.contentDisposition('a"b\\c-images.zip'),/["\\]{2}/);
});
