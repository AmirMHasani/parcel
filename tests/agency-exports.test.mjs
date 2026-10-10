// Agency plan, Phase 3: agency exports skip checkout, get 1 GB and priority, take one monthly slot atomically, give it
// back when nothing was produced, are opened by the agency key, and never share limits with free users on the same network.
import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const root=process.cwd();let sqlite,objects,fetches,stripeSub;
const environment={};globalThis.__parcelEnv=environment;
const modules=new Map();
function load(file){file=path.resolve(root,file);if(modules.has(file))return modules.get(file);let source=fs.readFileSync(file,'utf8');source=source.replace(/from\s+(['"])([^'"]+)\1/g,(match,q,spec)=>{if(spec==='cloudflare:workers')return 'from '+JSON.stringify('data:text/javascript,export const env=globalThis.__parcelEnv;');if(spec.startsWith('.')){let p=path.resolve(path.dirname(file),spec);if(p.endsWith('.mjs'))return 'from '+JSON.stringify('file://'+p);if(!p.endsWith('.ts'))p+='.ts';return 'from '+JSON.stringify(load(p));}return match;});const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');modules.set(file,url);return url;}
const agency=await import(load('lib/agency.ts')),exportsLib=await import(load('lib/agency-exports.ts')),jobs=await import(load('lib/jobs.ts')),worker=await import(load('lib/job-worker.ts'));
function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
const origin='https://parcel.test',good='https://cdn.shopify.com/a.png';
const request=(headers={},ip='1.2.3.4')=>new Request(origin,{headers:{'cf-connecting-ip':ip,...headers}});
const body=(n=2)=>({attempt:crypto.randomUUID(),key:'a'.repeat(64),items:Array.from({length:n},(_,i)=>({handle:n>25?'p'+i:'p',title:'Product',sku:'SKU',position:i+1,url:good+'?i='+i})),options:{mode:'sku',folders:true,manifest:true}});
const period=()=>({periodStart:Date.now()-86400000,periodEnd:Date.now()+29*86400000});
const active=async(over={})=>agency.createAccount({status:'active',...period(),...over});
const usage=(id,start)=>sqlite.prepare('SELECT used FROM usage_cycles WHERE account_id=? AND period_start=?').get(id,start)?.used||0;
const jobRow=id=>sqlite.prepare('SELECT * FROM exports WHERE id=?').get(id);
beforeEach(()=>{sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8').replaceAll('--> statement-breakpoint',''));environment.DB={prepare:statement,async batch(s){sqlite.exec('BEGIN');try{const results=[];for(const v of s)results.push(v.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};objects=new Map();environment.BUCKET={async put(key,data,opts={}){const bytes=data instanceof ReadableStream?Buffer.from(await new Response(data).arrayBuffer()):Buffer.from(data);objects.set(key,{data:bytes,...opts});},async head(key){let v=objects.get(key);return v?{size:v.data.length,customMetadata:v.customMetadata}:null;},async get(key,opts={}){let v=objects.get(key);if(!v)return null;if(opts.range)v={...v,data:v.data.subarray(opts.range.offset,opts.range.offset+opts.range.length)};return {size:v.data.length,customMetadata:v.customMetadata,body:new Response(v.data).body,arrayBuffer:async()=>v.data.buffer.slice(v.data.byteOffset,v.data.byteOffset+v.data.byteLength),json:async()=>JSON.parse(v.data.toString())};},async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])objects.delete(k);},async list({prefix,limit}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(key=>({key}))};}};
 fetches=[];stripeSub=null;globalThis.fetch=async(url,opts)=>{fetches.push({url:String(url),opts});if(String(url).startsWith('https://api.stripe.com/'))return Response.json(stripeSub||{});if(String(url).includes('missing'))return new Response('',{status:404});return new Response(new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]),{headers:{'Content-Type':'image/png'}});};
 process.env.EXPORT_SIGNING_SECRET='a'.repeat(64);process.env.STRIPE_SECRET_KEY='test-fixture';process.env.PAYMENTS_ENABLED='1';process.env.POLICIES_APPROVED='1';process.env.SUPPORT_EMAIL='support@example.test';process.env.AGENCY_ENABLED='1';process.env.STRIPE_AGENCY_PRICE_ID='price_fixture';delete process.env.RESEND_API_KEY;delete process.env.PUBLIC_SITE_URL;delete process.env.PAYPAL_CLIENT_ID;delete process.env.PAYPAL_CLIENT_SECRET;});

test('an agency export skips checkout, gets 1 GB and priority, and takes one slot of the period',async()=>{
 const {id,key}=await active();process.env.PAYMENTS_ENABLED='0'; // paid one-time exports are off, agency exports do not care
 const b=body(30),job=await jobs.createJob(request({'x-agency-key':key}),b);
 const row=jobRow(job.id);
 assert.equal(row.amount,0);assert.equal(row.max_bytes,1000000000);assert.equal(row.priority,1);assert.equal(row.agency_id,id);assert.equal(row.state,'queued');assert.equal(row.usage_slot,1);
 assert.equal(row.usage_period,sqlite.prepare('SELECT period_start FROM agency_accounts WHERE id=?').get(id).period_start);
 assert.equal(usage(id,row.usage_period),1);
 const s=await agency.summary(await agency.findAccount(request({'x-agency-key':key})));assert.equal(s.used,1);assert.equal(s.remaining,49);assert.equal(s.warning,false);
 const st=await jobs.status(row);assert.equal(st.agency,true);assert.equal(st.priority,1);assert.equal(st.amount,0);
 // the same CSV without the agency key is an ordinary paid export
 process.env.PAYMENTS_ENABLED='1';const plain=jobRow((await jobs.createJob(request({},'5.5.5.5'),body(30))).id);assert.equal(plain.amount,900);assert.equal(plain.priority,0);assert.equal(plain.agency_id,null);assert.equal(plain.usage_slot,0);
});

test('the cap: a warning at five remaining, a refusal with the reset date at fifty, and exactly one winner in a race at 49',async()=>{
 const {id,key}=await active();const start=sqlite.prepare('SELECT period_start FROM agency_accounts WHERE id=?').get(id).period_start;
 sqlite.prepare('INSERT INTO usage_cycles(account_id,period_start,used) VALUES(?,?,44)').run(id,start);
 await jobs.createJob(request({'x-agency-key':key}),body(1));
 let s=await agency.summary(await agency.findAccount(request({'x-agency-key':key})));assert.equal(s.used,45);assert.equal(s.remaining,5);assert.equal(s.warning,true);
 sqlite.prepare('UPDATE usage_cycles SET used=49 WHERE account_id=?').run(id);sqlite.prepare("UPDATE exports SET state='complete'").run();
 const results=await Promise.allSettled([jobs.createJob(request({'x-agency-key':key}),body(1)),jobs.createJob(request({'x-agency-key':key}),body(1))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const refused=results.find(r=>r.status==='rejected').reason;assert.equal(refused.status,409);assert.match(refused.message,/all 50 agency exports/);assert.match(refused.message,/one-time price/);
 assert.equal(usage(id,start),50);
 // nothing half-created for the refused one
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM exports WHERE agency_id=?").get(id).n,2);
});

test('cancelling before start and failing with zero images give the slot back, once; retries never take a new one',async()=>{
 const {id,key}=await active();const h={'x-agency-key':key};
 const b=body(1),job=await jobs.createJob(request(h),b);const start=jobRow(job.id).usage_period;assert.equal(usage(id,start),1);
 await jobs.jobAction(request({'x-export-key':b.key}),jobRow(job.id),'cancel');
 assert.equal(usage(id,start),0);assert.equal(jobRow(job.id).usage_slot,0);
 assert.equal(await exportsLib.releaseUsageSlot(job.id),false); // second release is a no-op
 // zero-image failure
 const bad=body(1);bad.items[0].url='https://cdn.shopify.com/missing.png';const failed=await jobs.createJob(request(h),bad);assert.equal(usage(id,start),1);
 for(let i=0;i<4;i++)await worker.tick();
 assert.equal(jobRow(failed.id).state,'failed');assert.equal(jobRow(failed.id).completed,0);assert.equal(usage(id,start),0);assert.equal(jobRow(failed.id).usage_slot,0);
 await jobs.jobAction(request({'x-export-key':bad.key}),jobRow(failed.id),'retry');assert.equal(usage(id,start),0);
 for(let i=0;i<4;i++)await worker.tick();assert.equal(jobRow(failed.id).state,'failed');assert.equal(usage(id,start),0); // failing again does not refund twice
 // an export that produced images keeps its slot even if cancelled later
 const ok=body(2),good=await jobs.createJob(request(h),ok);await worker.tick();assert.equal(jobRow(good.id).completed,1);
 await jobs.jobAction(request({'x-export-key':ok.key}),jobRow(good.id),'cancel');assert.equal(usage(id,start),1);assert.equal(jobRow(good.id).usage_slot,1);
});

test('the agency key opens the account\'s own exports and nothing else',async()=>{
 const a=await active(),other=await active();
 const b=body(1),job=await jobs.createJob(request({'x-agency-key':a.key}),b);
 assert.equal((await jobs.getJob(request({'x-agency-key':a.key}),job.id)).id,job.id);
 assert.equal((await jobs.getJob(request({'x-export-key':b.key}),job.id)).id,job.id);
 await assert.rejects(jobs.getJob(request({'x-agency-key':other.key}),job.id),e=>e.status===404);
 await assert.rejects(jobs.getJob(request({'x-agency-key':'f'.repeat(64)}),job.id),e=>e.status===404);
 const plain=await jobs.createJob(request({},'9.9.9.9'),body(1));
 await assert.rejects(jobs.getJob(request({'x-agency-key':a.key}),plain.id),e=>e.status===404);
});

test('accounts that are not active get a specific answer and no job',async()=>{
 const cases=[[{status:'pending'},409,/Finish checkout/],[{status:'free'},409,/ended/],[{status:'past_due'},402,/Update your card/]];
 for(const [over,status,message] of cases){const {key}=await agency.createAccount({...period(),...over});await assert.rejects(jobs.createJob(request({'x-agency-key':key}),body(1)),e=>e.status===status&&message.test(e.message));}
 const sus=await active();sqlite.prepare('UPDATE agency_accounts SET suspended=1 WHERE id=?').run(sus.id);
 await assert.rejects(jobs.createJob(request({'x-agency-key':sus.key}),body(1)),e=>e.status===403);
 const noPeriod=await agency.createAccount({status:'active'});
 await assert.rejects(jobs.createJob(request({'x-agency-key':noPeriod.key}),body(1)),e=>e.status===409&&/billing period/.test(e.message));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM exports').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM usage_cycles').get().n,0);
 await assert.rejects(jobs.createJob(request({'x-agency-key':'b'.repeat(64)}),body(1)),e=>e.status===404);
});

test('a period that rolled over is refreshed from Stripe before the export is counted',async()=>{
 const {id,key}=await active({periodStart:Date.now()-40*86400000,periodEnd:Date.now()-10*86400000});
 sqlite.prepare("UPDATE agency_accounts SET stripe_subscription='sub_1',status_checked_at=? WHERE id=?").run(Date.now(),id);
 const newStart=Math.floor(Date.now()/1000)-3600;stripeSub={status:'active',customer:'cus_1',current_period_start:newStart,current_period_end:newStart+30*86400,items:{data:[{}]}};
 const job=await jobs.createJob(request({'x-agency-key':key}),body(1));
 assert.equal(jobRow(job.id).usage_period,newStart*1000);assert.equal(usage(id,newStart*1000),1);assert(fetches.some(f=>f.url.includes('/subscriptions/sub_1')));
 // without a subscription to ask, an ended period is refused
 const stale=await active({periodStart:1,periodEnd:2});
 await assert.rejects(jobs.createJob(request({'x-agency-key':stale.key}),body(1)),e=>e.status===409&&/renewal/.test(e.message));
});

test('agency limits are per account and never shared with free users on the same network',async()=>{
 const {id,key}=await active();const h={'x-agency-key':key};
 // four active agency exports, the fifth is refused and its slot is given back
 for(let i=0;i<4;i++)await jobs.createJob(request(h),body(1));
 await assert.rejects(jobs.createJob(request(h),body(1)),e=>e.status===429&&/4 agency exports/.test(e.message));
 assert.equal(usage(id,jobRow(sqlite.prepare('SELECT id FROM exports LIMIT 1').get().id).usage_period),4);
 // the same network address can still run its own two free exports and its daily creations are untouched
 await jobs.createJob(request(),body(1));await jobs.createJob(request(),body(1));
 await assert.rejects(jobs.createJob(request(),body(1)),e=>e.status===429&&/Two exports/.test(e.message));
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM usage_limits WHERE id LIKE 'rate:create-export:%'").get().n,1);
 assert.equal(sqlite.prepare("SELECT value FROM usage_limits WHERE id LIKE 'rate:create-export:%'").get().value,3); // three plain attempts, zero agency ones
 // daily creation limit per account
 sqlite.prepare("DELETE FROM exports").run();
 const day=Math.floor(Date.now()/86400000)*86400000;sqlite.prepare("UPDATE usage_limits SET value=? WHERE id=?").run(exportsLib.AGENCY_DAILY_CREATIONS,'rate:agency-create:'+id+':'+day);
 await assert.rejects(jobs.createJob(request(h),body(1)),e=>e.status===429&&/per day/.test(e.message));
});

test('image downloads for agency exports draw on the account\'s own daily allowance, not the network\'s',async()=>{
 const {id,key}=await active();await jobs.createJob(request({'x-agency-key':key}),body(1));await worker.tick();
 const ids=sqlite.prepare("SELECT id FROM usage_limits WHERE id LIKE 'bytes:%'").all().map(r=>r.id);
 assert(ids.some(x=>x.startsWith('bytes:agency:'+id+':')),ids.join());
 assert(!ids.some(x=>x.startsWith('bytes:')&&!x.startsWith('bytes:agency:')&&!x.startsWith('bytes:global:')));
});

test('when the plan is off, agency keys are ignored for creation but still open existing agency exports',async()=>{
 const {key}=await active();const b=body(1),job=await jobs.createJob(request({'x-agency-key':key}),b);
 delete process.env.AGENCY_ENABLED;
 await assert.rejects(jobs.createJob(request({'x-agency-key':key}),body(1)),e=>e.status===404);
 assert.equal((await jobs.getJob(request({'x-agency-key':key}),job.id)).id,job.id);
});
