import {createHash} from 'node:crypto';
import {verifyDownload} from '../scripts/verify-download.mjs';
import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const root=process.cwd();let sqlite,objects,fetches;
const environment={};globalThis.__parcelEnv=environment;
const modules=new Map();
function load(file){file=path.resolve(root,file);if(modules.has(file))return modules.get(file);let source=fs.readFileSync(file,'utf8');source=source.replace(/from\s+(['"])([^'"]+)\1/g,(match,q,spec)=>{if(spec==='cloudflare:workers')return 'from '+JSON.stringify('data:text/javascript,export const env=globalThis.__parcelEnv;');if(spec.startsWith('.')){let p=path.resolve(path.dirname(file),spec);if(p.endsWith('.mjs'))return 'from '+JSON.stringify('file://'+p);if(!p.endsWith('.ts'))p+='.ts';return 'from '+JSON.stringify(load(p));}return match;});const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');modules.set(file,url);return url;}
const guard=await import(load('lib/guard.ts')),jobs=await import(load('lib/jobs.ts')),worker=await import(load('lib/job-worker.ts')),capacity=await import(load('lib/capacity.ts')),downloader=await import(load('lib/downloader.ts'));
function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
const origin='https://parcel.test',good='https://cdn.shopify.com/a.png';
const request=(key='',ip='1.2.3.4')=>new Request(origin,{headers:{'cf-connecting-ip':ip,'x-export-key':key}});
const body=(n=2)=>({attempt:crypto.randomUUID(),key:'a'.repeat(64),items:Array.from({length:n},(_,i)=>({handle:n>25?'p'+i:'p',title:'Product',sku:'SKU',position:i+1,url:good+'?i='+i})),options:{mode:'sku',folders:true,manifest:true}});
beforeEach(()=>{sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8').replaceAll('--> statement-breakpoint',''));environment.DB={prepare:statement,async batch(s){sqlite.exec('BEGIN');try{const results=[];for(const v of s)results.push(v.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};objects=new Map();environment.BUCKET={async put(key,data,opts={}){const bytes=data instanceof ReadableStream?Buffer.from(await new Response(data).arrayBuffer()):Buffer.from(data);objects.set(key,{data:bytes,...opts});},async head(key){let v=objects.get(key);return v?{size:v.data.length,customMetadata:v.customMetadata}:null;},async get(key,opts={}){let v=objects.get(key);if(!v)return null;if(opts.range)v={...v,data:v.data.subarray(opts.range.offset,opts.range.offset+opts.range.length)};return {size:v.data.length,customMetadata:v.customMetadata,body:new Response(v.data).body,arrayBuffer:async()=>v.data.buffer.slice(v.data.byteOffset,v.data.byteOffset+v.data.byteLength),json:async()=>JSON.parse(v.data.toString())};},async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])objects.delete(k);},async list({prefix,limit}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(key=>({key}))};}};fetches=[];globalThis.fetch=async(url,opts)=>{fetches.push({url:String(url),opts});if(String(url).includes('missing'))return new Response('',{status:404});return new Response(new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]),{headers:{'Content-Type':'image/png'}});};process.env.EXPORT_SIGNING_SECRET='a'.repeat(64);process.env.STRIPE_SECRET_KEY='test-fixture';process.env.PAYMENTS_ENABLED='1';process.env.POLICIES_APPROVED='1';process.env.SUPPORT_EMAIL='support@example.test';delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;delete process.env.PUBLIC_SITE_URL;delete process.env.PAYPAL_CLIENT_ID;delete process.env.PAYPAL_CLIENT_SECRET;delete process.env.CLIENT_DAILY_BYTES;delete process.env.GLOBAL_DAILY_BYTES;delete process.env.MAX_CONCURRENT_JOBS;delete process.env.MAX_ACTIVE_EXPORTS;delete process.env.MAX_CONCURRENT_PACKING;});
test('atomic quotas reject overflow and release unused byte reservations',async()=>{await guard.consume('counter',1,2,Date.now()+100000);await guard.consume('counter',1,2,Date.now()+100000);await assert.rejects(guard.consume('counter',1,2,Date.now()+100000),e=>e.status===429);const release=await guard.reserveTransfer('ip',20000000);await release(123);const rows=sqlite.prepare("SELECT value FROM usage_limits WHERE id LIKE 'bytes:%'").all();assert(rows.every(r=>r.value===123));});
test('idempotent job creation preserves job and enforces two active exports',async()=>{const b=body();const one=await jobs.createJob(request(),b);const again=await jobs.createJob(request(),b);assert.equal(one.id,again.id);await jobs.createJob(request(),body());await assert.rejects(jobs.createJob(request(),body()),e=>e.status===429);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM exports').get().n,2);});
test('recovery keys isolate jobs',async()=>{const b=body(),j=await jobs.createJob(request(),b);await assert.rejects(jobs.getJob(request('wrong'),j.id),e=>e.status===404);assert.equal((await jobs.getJob(request(b.key),j.id)).id,j.id);});
test('worker restart resumes saved progress and produces downloadable ZIP',async()=>{const b=body(),j=await jobs.createJob(request(),b);await worker.tick();let row=sqlite.prepare('SELECT * FROM exports').get();assert.equal(row.completed,1);sqlite.prepare('UPDATE exports SET lease_owner=?,lease_until=? WHERE id=?').run('dead-worker',Date.now()-1,j.id);await worker.tick();await worker.tick();row=sqlite.prepare('SELECT * FROM exports').get();assert.equal(row.state,'complete');assert.equal(row.completed,2);assert.equal(fetches.length,2);const part=sqlite.prepare('SELECT * FROM export_parts').get();assert(objects.has(part.object_key));assert.equal(objects.get(part.object_key).data.readUInt32LE(0),0x04034b50);});
test('orphaned saved image after interrupted commit is reused',async()=>{const b=body(1),j=await jobs.createJob(request(),b);objects.set('exports/'+j.id+'/images/0',{data:Buffer.from('saved'),customMetadata:{extension:'png'}});await worker.tick();assert.equal(fetches.length,0);assert.equal(sqlite.prepare('SELECT completed FROM exports').get().completed,1);});
test('interruption after result insert reconciles counters without refetch',async()=>{const b=body(1),j=await jobs.createJob(request(),b);await worker.tick();sqlite.prepare('UPDATE exports SET cursor=0,completed=0,bytes=0').run();await worker.tick();assert.equal(fetches.length,1);assert.equal(sqlite.prepare('SELECT completed FROM exports').get().completed,1);});
test('partial failures remain downloadable and retries reuse successful images',async()=>{const b=body(2);b.items[1].url='https://cdn.shopify.com/missing.png';const j=await jobs.createJob(request(),b);await worker.tick();await worker.tick();await worker.tick();let current=await jobs.getJob(request(b.key),j.id);assert.equal(current.state,'partial');assert.equal(current.completed,1);assert.equal(current.failed,1);await jobs.jobAction(request(b.key),current,'retry');await worker.tick();assert.equal(fetches.filter(f=>f.url===b.items[0].url).length,1);});
test('paid failures refund with idempotency and refund status tracking',async()=>{process.env.STRIPE_SECRET_KEY='test-fixture';const b=body(26),j=await jobs.createJob(request(),b);sqlite.prepare("UPDATE exports SET state='failed',payment_intent='pi_fixture',refund_state='pending' WHERE id=?").run(j.id);let calls=0;globalThis.fetch=async(url,opts)=>{calls++;assert.equal(opts.headers['Idempotency-Key'],'parcel-refund-'+j.id);return Response.json({id:'re_fixture',status:'succeeded'});};await worker.tick();assert.equal(sqlite.prepare('SELECT refund_state FROM exports').get().refund_state,'refunded');await worker.tick();assert.equal(calls,1);delete process.env.STRIPE_SECRET_KEY;});
test('expiry denies recovery and cleanup removes stored files',async()=>{const b=body(1),j=await jobs.createJob(request(),b);await worker.tick();await worker.tick();sqlite.prepare('UPDATE exports SET expires=?').run(Date.now()-1);await assert.rejects(jobs.getJob(request(b.key),j.id),e=>e.status===410);await worker.cleanup();await worker.cleanup();assert.equal(objects.size,0);assert.equal(sqlite.prepare('SELECT state FROM exports').get().state,'expired');});
test('bounded request parsing rejects oversized body',async()=>{await assert.rejects(guard.boundedJSON(new Request(origin,{method:'POST',body:'x'.repeat(100)}),50),e=>e.status===413);});
test('cancelling an open checkout expires Stripe session before cancellation',async()=>{const b=body(26),j=await jobs.createJob(request(),b);sqlite.prepare("UPDATE exports SET session='cs_fixture',state='awaiting_payment' WHERE id=?").run(j.id);let expired=false;globalThis.fetch=async(url,opts)=>{if(String(url).endsWith('/expire')){expired=true;return Response.json({status:'expired'});}return Response.json({status:'open',payment_status:'unpaid'});};process.env.STRIPE_SECRET_KEY='test-fixture';await jobs.jobAction(request(b.key),await jobs.getJob(request(b.key),j.id),'cancel');assert(expired);assert.equal(sqlite.prepare('SELECT state FROM exports').get().state,'cancelled');delete process.env.STRIPE_SECRET_KEY;});
test('stale retry action cannot clear parts produced after an earlier retry',async()=>{const b=body(1),j=await jobs.createJob(request(),b);await worker.tick();await worker.tick();sqlite.prepare("UPDATE exports SET state='partial' WHERE id=?").run(j.id);const stale=await jobs.getJob(request(b.key),j.id);await jobs.jobAction(request(b.key),stale,'retry');await worker.tick();await worker.tick();const parts=sqlite.prepare('SELECT COUNT(*) n FROM export_parts').get().n;await assert.rejects(jobs.jobAction(request(b.key),stale,'retry'),e=>e.status===409);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM export_parts').get().n,parts);assert.equal(sqlite.prepare('SELECT retry_count FROM exports').get().retry_count,1);});
test('action refuses an active worker lease',async()=>{const b=body(1),j=await jobs.createJob(request(),b);sqlite.prepare('UPDATE exports SET lease_until=?,lease_owner=?').run(Date.now()+120000,'active-worker');await assert.rejects(jobs.jobAction(request(b.key),j,'cancel'),e=>e.status===409);assert.equal(sqlite.prepare('SELECT state FROM exports').get().state,'queued');});
test('idempotent creation survives a client IP change and expiry rejects reuse',async()=>{const b=body(1),j=await jobs.createJob(request(),b);assert.equal((await jobs.createJob(request(b.key,'9.8.7.6'),b)).id,j.id);sqlite.prepare('UPDATE exports SET expires=?').run(Date.now()-1);await assert.rejects(jobs.createJob(request(),b),e=>e.status===410);});
test('payment launch gate rejects paid jobs before allocating storage',async()=>{process.env.PAYMENTS_ENABLED='0';await assert.rejects(jobs.createJob(request(),body(26)),e=>e.status===503);assert.equal(objects.size,0);});
test('paid cancellation recovers a legacy checkout created before session persistence',async()=>{const b=body(26),j=await jobs.createJob(request(),b);sqlite.prepare("UPDATE exports SET state='awaiting_payment' WHERE id=?").run(j.id);j.state='awaiting_payment';let expired=false;globalThis.fetch=async(url,opts)=>{if(String(url).endsWith('/expire')){expired=true;return Response.json({status:'expired'});}if(opts?.method==='POST'){assert.equal(opts.headers['Idempotency-Key'],'parcel-job-'+j.id);return Response.json({id:'cs_recovered',url:'https://checkout.stripe.com/fixture'});}return Response.json({status:'open',payment_status:'unpaid'});};await jobs.jobAction(request(b.key),j,'cancel');assert(expired);assert.equal(sqlite.prepare('SELECT session FROM exports').get().session,'cs_recovered');});
test('temporary CDN failures return a resumable worker result and preserve position',async()=>{const b=body(1),j=await jobs.createJob(request(),b);globalThis.fetch=async()=>new Response('',{status:503});assert.equal((await worker.tick()).type,'retry');const row=sqlite.prepare('SELECT * FROM exports').get();assert.equal(row.cursor,0);assert.equal(row.attempts,1);assert.equal(row.lease_until,0);sqlite.prepare('UPDATE exports SET next_run=0').run();globalThis.fetch=async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});await worker.tick();assert.equal(sqlite.prepare('SELECT completed FROM exports').get().completed,1);});
test('payment verification rejects a paid session for another manifest',async()=>{const b=body(26),j=await jobs.createJob(request(),b);sqlite.prepare("UPDATE exports SET session='cs_fixture' WHERE id=?").run(j.id);globalThis.fetch=async()=>Response.json({payment_status:'paid',metadata:{job_hash:'wrong',export_id:j.id},amount_total:j.amount,currency:'usd',payment_intent:'pi_fixture'});await assert.rejects(jobs.confirmPayment(await jobs.getJob(request(b.key),j.id)),e=>e.status===409);assert.equal(sqlite.prepare('SELECT payment_intent FROM exports').get().payment_intent,null);});
test('paid launch requires an approved policy and support contact',async()=>{delete process.env.SUPPORT_EMAIL;await assert.rejects(jobs.createJob(request(),body(26)),e=>e.status===503);process.env.SUPPORT_EMAIL='support@example.test';process.env.POLICIES_APPROVED='0';await assert.rejects(jobs.createJob(request(),body(26)),e=>e.status===503);assert.equal(objects.size,0);});
test('a previously successful refund that later fails is flagged for review',async()=>{const b=body(26),j=await jobs.createJob(request(),b);sqlite.prepare("UPDATE exports SET state='failed',payment_intent='pi_fixture',refund_state='refunded',refund_id='re_fixture',next_run=0 WHERE id=?").run(j.id);globalThis.fetch=async(url,opts)=>{assert(String(url).endsWith('refunds/re_fixture'));assert.equal(opts.method,'GET');return Response.json({id:'re_fixture',status:'failed'});};await worker.tick();assert.equal(sqlite.prepare('SELECT refund_state FROM exports').get().refund_state,'needs_review');});
test('pausing payments prevents an existing unpaid checkout from being reopened',async()=>{const b=body(26),j=await jobs.createJob(request(),b);sqlite.prepare("UPDATE exports SET state='complete',session='cs_fixture' WHERE id=?").run(j.id);process.env.PAYMENTS_ENABLED='0';globalThis.fetch=async()=>Response.json({status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/fixture'});await assert.rejects(jobs.checkoutJob(await jobs.getJob(request(b.key),j.id),origin),e=>e.status===503);});

const caps=await import(load('lib/capabilities.ts')),notifications=await import(load('lib/notifications.ts'));
async function readyPaid(){const b=body(26),j=await jobs.createJob(request(),b);sqlite.prepare("UPDATE exports SET state='complete',ready_at=?,parts=1,completed=26 WHERE id=?").run(Date.now(),j.id);sqlite.prepare("INSERT INTO export_parts(id,job_id,part,object_key,bytes,images) VALUES(?,?,1,'fixture',100,26)").run(j.id+':1',j.id);return {b,j:await jobs.getJob(request(b.key),j.id)};}
test('paid package starts processing before payment and rejects early checkout',async()=>{const b=body(26),j=await jobs.createJob(request(),b);assert.equal(j.state,'queued');await assert.rejects(jobs.jobAction(request(b.key),j,'checkout'),e=>e.status===409);await worker.tick();assert.equal(sqlite.prepare('SELECT completed FROM exports').get().completed,1);assert.equal(fetches.length,1);});
test('ready package starts its 24-hour retention at completion, without extending on retry',async()=>{const b=body(1),j=await jobs.createJob(request(),b);sqlite.prepare('UPDATE exports SET created=?,expires=?').run(Date.now()-3600000,Date.now()+3600000);await worker.tick();await worker.tick();const row=await jobs.getJob(request(b.key),j.id);assert(row.ready_at>=Date.now()-1000);assert.equal(row.expires-row.ready_at,86400000);sqlite.prepare("UPDATE exports SET state='partial' WHERE id=?").run(j.id);await jobs.jobAction(request(b.key),await jobs.getJob(request(b.key),j.id),'retry');await worker.tick();await worker.tick();assert.equal((await jobs.getJob(request(b.key),j.id)).expires,row.expires);});
test('paid downloads require verified payment and minted links expire and resist tampering',async()=>{const {b,j}=await readyPaid();await assert.rejects(caps.downloadLink(j,1,origin),e=>e.status===402);sqlite.prepare("UPDATE exports SET payment_intent='pi_verified' WHERE id=?").run(j.id);const paid=await jobs.getJob(request(b.key),j.id);const result=await caps.downloadLink(paid,1,origin),token=new URL(result.url).searchParams.get('token');assert.equal((await caps.downloadAccess(token)).job.id,j.id);await assert.rejects(caps.downloadAccess(token+'x'),e=>e.status===403);await assert.rejects(caps.downloadLink(paid,2,origin),e=>e.status===404);const realNow=Date.now;try{Date.now=()=>realNow()+3600001;await assert.rejects(caps.downloadAccess(token),e=>e.status===403);}finally{Date.now=realNow;}assert.equal((await caps.downloadAccess(token)).part,1);sqlite.prepare("UPDATE exports SET refund_state='pending'").run();await assert.rejects(caps.downloadAccess(token),e=>e.status===403);});
test('Stripe verifies ready package payment without reprocessing or double checkout',async()=>{const {b,j}=await readyPaid();globalThis.fetch=async(url,opts)=>{fetches.push({url:String(url),opts});if(opts?.method==='POST'){const p=new URLSearchParams(opts.body);assert.equal(p.get('line_items[0][price_data][unit_amount]'),String(j.amount));assert(p.get('success_url').includes('/results?export='));return Response.json({id:'cs_ready',url:'https://checkout.stripe.com/fixture'});}return Response.json({payment_status:'paid',metadata:{job_hash:j.hash,export_id:j.id},amount_total:j.amount,currency:'usd',payment_intent:'pi_ready'});};await jobs.jobAction(request(b.key),j,'checkout',{provider:'stripe'});await jobs.jobAction(request(b.key),j,'confirm');const row=await jobs.getJob(request(b.key),j.id);assert.equal(row.state,'complete');assert.equal(row.payment_intent,'pi_ready');assert.deepEqual(await jobs.jobAction(request(b.key),row,'checkout'),{paid:true});assert.equal(fetches.filter(f=>f.opts?.method==='POST').length,1);});
test('concurrent ticks claim distinct jobs and enforce a configured two-job capacity',async()=>{process.env.MAX_CONCURRENT_JOBS='2';const a=await jobs.createJob(request('', '1.1.1.1'),body(2)),b=await jobs.createJob(request('', '2.2.2.2'),body(2)),c=await jobs.createJob(request('', '3.3.3.3'),body(2));let release,entered=0;const wait=new Promise(r=>release=r);globalThis.fetch=async()=>{entered++;await wait;return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});};const ticks=[worker.tick(false),worker.tick(false),worker.tick(false)];await new Promise(r=>setTimeout(r,20));assert.equal(entered,2);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM exports WHERE lease_until>?').get(Date.now()).n,2);release();const results=await Promise.all(ticks);assert.equal(results.filter(r=>r.worked).length,2);assert.equal(new Set(results.filter(r=>r.job).map(r=>r.job)).size,2);await worker.tick(false);assert.equal(sqlite.prepare('SELECT completed FROM exports WHERE id=?').get(c.id).completed,1);});
test('email is encrypted and queued when delivery is not configured, with no send attempt',async()=>{const b=body();b.email='reader@example.test';const j=await jobs.createJob(request(),b);const row=sqlite.prepare('SELECT * FROM email_outbox WHERE job_id=?').get(j.id);assert.equal(row.state,'waiting');assert(!row.payload.includes(b.email));assert.equal((await caps.open(row.payload)).email,b.email);assert.equal(await notifications.emailTick(),false);assert.equal(fetches.length,0);});
function configureEmail(){process.env.RESEND_API_KEY='fixture';process.env.EMAIL_FROM='Parcel <exports@example.test>';process.env.PUBLIC_SITE_URL=origin;}
test('email sends only when ready, encrypts keys, and duplicate ticks do not send again',async()=>{configureEmail();const b=body(1);b.email='user@example.test';const j=await jobs.createJob(request(),b);const before=sqlite.prepare('SELECT * FROM email_outbox').get();assert(!before.payload.includes(b.email));assert(!before.payload.includes(b.key));assert.equal(await notifications.emailTick(),false);await worker.tick();await worker.tick();let sent=0;globalThis.fetch=async(url,opts)=>{assert.equal(String(url),'https://api.resend.com/emails');assert.equal(opts.headers['Idempotency-Key'],'parcel-ready-'+j.id);const message=JSON.parse(opts.body);assert(message.text.includes('/results#export='+j.id+'&key='+b.key));assert.deepEqual(message.to,[b.email]);sent++;return Response.json({id:'email_ready'});};await Promise.all([notifications.emailTick(),notifications.emailTick()]);assert.equal(sent,1);await notifications.emailTick();assert.equal(sent,1);const outbox=sqlite.prepare('SELECT * FROM email_outbox').get();assert.equal(outbox.state,'sent');assert.equal(outbox.payload,null);assert.equal(outbox.message,null);});
test('notification retries freeze payload and expire with the results',async()=>{configureEmail();const b=body(1);b.email='user@example.test';const j=await jobs.createJob(request(),b);await worker.tick();await worker.tick();const payloads=[];globalThis.fetch=async(url,opts)=>{payloads.push(opts.body);return new Response('',{status:503});};await notifications.emailTick();sqlite.prepare('UPDATE email_outbox SET next_run=0').run();process.env.EMAIL_FROM='Changed <changed@example.test>';await notifications.emailTick();assert.equal(payloads[0],payloads[1]);sqlite.prepare('UPDATE exports SET expires=?').run(Date.now()-1);await worker.cleanup();assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);});
test('PayPal order binds server price and only a matching completed capture unlocks package',async()=>{process.env.PAYPAL_CLIENT_ID='fixture';process.env.PAYPAL_CLIENT_SECRET='fixture';const {b,j}=await readyPaid();let captured=0;const order={id:'ORDER_FIXTURE',intent:'CAPTURE',status:'APPROVED',purchase_units:[{custom_id:j.id,reference_id:j.hash,amount:{currency_code:'USD',value:(j.amount/100).toFixed(2)}}]};globalThis.fetch=async(url,opts)=>{if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fixture'});if(String(url).endsWith('/orders')){const p=JSON.parse(opts.body);assert.equal(p.purchase_units[0].amount.value,(j.amount/100).toFixed(2));return Response.json({...order,status:'CREATED',links:[{rel:'payer-action',href:'https://www.paypal.com/checkoutnow?token=ORDER_FIXTURE'}]});}if(String(url).endsWith('/capture')){captured++;assert.equal(opts.headers['PayPal-Request-Id'],'c-'+j.id);return Response.json({...order,status:'COMPLETED',purchase_units:[{...order.purchase_units[0],payments:{captures:[{id:'CAPTURE_FIXTURE',status:'COMPLETED',amount:order.purchase_units[0].amount}]}}]});}return Response.json(order);};await jobs.jobAction(request(b.key),j,'checkout',{provider:'paypal'});await jobs.jobAction(request(b.key),j,'confirm');const row=await jobs.getJob(request(b.key),j.id);assert.equal(row.payment_provider,'paypal');assert.equal(row.payment_intent,'CAPTURE_FIXTURE');assert.equal(row.state,'complete');assert.equal(captured,1);assert.deepEqual(await jobs.jobAction(request(b.key),row,'checkout'),{paid:true});assert.equal(captured,1);});
test('PayPal rejects mismatched order without capturing funds',async()=>{process.env.PAYPAL_CLIENT_ID='fixture';process.env.PAYPAL_CLIENT_SECRET='fixture';const {b,j}=await readyPaid();sqlite.prepare("UPDATE exports SET payment_provider='paypal',session='WRONG'").run();globalThis.fetch=async(url)=>String(url).endsWith('/oauth2/token')?Response.json({access_token:'fixture'}):Response.json({intent:'CAPTURE',status:'APPROVED',purchase_units:[{custom_id:j.id,reference_id:'wrong',amount:{currency_code:'USD',value:'9.00'}}]});await assert.rejects(jobs.jobAction(request(b.key),j,'confirm'),e=>e.status===409);assert.equal(sqlite.prepare('SELECT payment_intent FROM exports').get().payment_intent,null);});

test('packing shares the global capacity instead of pausing other exports',async()=>{const a=await jobs.createJob(request('', '1.1.1.1'),body(1)),b=await jobs.createJob(request('', '2.2.2.2'),body(1));await worker.tick(false);assert.equal(sqlite.prepare('SELECT cursor FROM exports WHERE id=?').get(a.id).cursor,1);sqlite.prepare('UPDATE exports SET next_run=0 WHERE id=?').run(a.id);const get=environment.BUCKET.get;let release,entered=0;const waiting=new Promise(r=>release=r);environment.BUCKET.get=async key=>{if(key.includes('/images/')){entered++;await waiting;}return get(key);};const ticks=[worker.tick(false),worker.tick(false)];await new Promise(r=>setTimeout(r,20));assert.equal(entered,1);assert.equal(sqlite.prepare('SELECT completed FROM exports WHERE id=?').get(b.id).completed,1);assert.equal(sqlite.prepare('SELECT lease_until>? held FROM exports WHERE id=?').get(Date.now(),a.id).held,1);release();const results=await Promise.all(ticks);environment.BUCKET.get=get;assert.deepEqual(results.map(r=>r.type).sort(),['image','pack']);assert.equal(sqlite.prepare('SELECT state FROM exports WHERE id=?').get(a.id).state,'complete');});
test('at most two exports build ZIPs at once while image downloads continue',async()=>{const ready=[];for(let i=0;i<3;i++){const j=await jobs.createJob(request('', '50.0.0.'+i),body(1));ready.push(j);}for(let i=0;i<3;i++)await worker.tick(false);for(const j of ready)assert.equal(sqlite.prepare('SELECT cursor FROM exports WHERE id=?').get(j.id).cursor,1);const fresh=await jobs.createJob(request('', '50.0.0.9'),body(1));sqlite.prepare('UPDATE exports SET next_run=0 WHERE id!=?').run(fresh.id);const get=environment.BUCKET.get;let release,entered=0;const waiting=new Promise(r=>release=r);environment.BUCKET.get=async key=>{if(key.includes('/images/')){entered++;await waiting;}return get(key);};const ticks=Array.from({length:4},()=>worker.tick(false));await new Promise(r=>setTimeout(r,30));assert.equal(entered,2);assert.equal(sqlite.prepare('SELECT completed FROM exports WHERE id=?').get(fresh.id).completed,1);release();const results=await Promise.all(ticks);environment.BUCKET.get=get;assert.equal(results.filter(r=>r.type==='pack').length,2);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM exports WHERE state='complete'").get().n,2);await worker.tick(false);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM exports WHERE state='complete'").get().n,3);});
test('tick route sends headers before its ticks finish and reports failures in the body',async()=>{const secret='w'.repeat(32);process.env.PARCEL_WORKER_SECRET=secret;try{const route=await import(load('app/api/worker/tick/route.ts'));const call=()=>route.POST(new Request(origin+'/api/worker/tick',{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify({clean:false})}));await jobs.createJob(request('', '60.0.0.1'),body(1));let release;const wait=new Promise(r=>release=r);globalThis.fetch=async()=>{await wait;return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});};const response=await Promise.race([call(),new Promise((_,reject)=>setTimeout(()=>reject(Error('headers waited for the ticks')),200))]);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/json/);release();const result=await response.json();assert.equal(result.worked,true);assert.match(result.type,/image/);const db=environment.DB;environment.DB=undefined;try{const failed=await (await call()).json();assert.equal(failed.status,503);assert.equal(failed.worked,false);assert.match(failed.error,/Storage/);}finally{environment.DB=db;}assert.equal((await route.POST(new Request(origin,{method:'POST',body:'{}'}))).status,403);}finally{delete process.env.PARCEL_WORKER_SECRET;}});
test('ten exports process at once by default and the eleventh waits for a free slot',async()=>{assert.equal(capacity.maxConcurrentJobs(),10);const made=[];for(let i=0;i<11;i++)made.push(await jobs.createJob(request('', '10.0.0.'+i),body(1)));let release,entered=0;const wait=new Promise(r=>release=r);globalThis.fetch=async()=>{entered++;await wait;return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});};const ticks=Array.from({length:11},()=>worker.tick(false));await new Promise(r=>setTimeout(r,30));assert.equal(entered,10);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM exports WHERE lease_until>?').get(Date.now()).n,10);release();const results=await Promise.all(ticks);assert.equal(results.filter(r=>r.worked).length,10);const waiting=made.find(j=>sqlite.prepare('SELECT cursor FROM exports WHERE id=?').get(j.id).cursor===0);assert(waiting);await worker.tick(false);assert.equal(sqlite.prepare('SELECT completed FROM exports WHERE id=?').get(waiting.id).completed,1);});
test('capacity settings come from configuration and ignore invalid values',async()=>{process.env.MAX_CONCURRENT_JOBS='4';process.env.MAX_ACTIVE_EXPORTS='12';assert.equal(capacity.maxConcurrentJobs(),4);assert.equal(capacity.maxActiveExports(),12);process.env.MAX_ACTIVE_EXPORTS='2';assert.equal(capacity.maxActiveExports(),4);for(const bad of ['0','abc','2.5','999','']){process.env.MAX_CONCURRENT_JOBS=bad;assert.equal(capacity.maxConcurrentJobs(),10);}assert.equal(capacity.maxConcurrentJobs('3'),3);delete process.env.MAX_CONCURRENT_JOBS;assert.equal(capacity.maxConcurrentPacking(),2);for(const bad of ['0','5','x'])assert.equal(capacity.maxConcurrentPacking(bad),2);assert.equal(capacity.maxConcurrentPacking('4'),4);process.env.MAX_CONCURRENT_JOBS='1';assert.equal(capacity.maxConcurrentPacking('3'),1);});
test('the service-wide active-export limit is configurable and still refuses overflow',async()=>{process.env.MAX_ACTIVE_EXPORTS='3';process.env.MAX_CONCURRENT_JOBS='2';for(let i=0;i<3;i++)await jobs.createJob(request('', '20.0.0.'+i),body(1));await assert.rejects(jobs.createJob(request('', '20.0.0.9'),body(1)),e=>e.status===429&&/queue is full/.test(e.message));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM exports').get().n,3);});
test('per-client limits stay at two active exports and five new exports per day',async()=>{const ip='7.7.7.7',burst=()=>sqlite.prepare("DELETE FROM usage_limits WHERE id LIKE 'rate:create-burst:%'").run();const one=await jobs.createJob(request('',ip),body(1)),two=await jobs.createJob(request('',ip),body(1));burst();await assert.rejects(jobs.createJob(request('',ip),body(1)),e=>e.status===429&&/Two exports are already active/.test(e.message));sqlite.prepare("UPDATE exports SET state='complete' WHERE id IN (?,?)").run(one.id,two.id);burst();await jobs.createJob(request('',ip),body(1));await jobs.createJob(request('',ip),body(1));sqlite.prepare("UPDATE exports SET state='complete'").run();burst();await assert.rejects(jobs.createJob(request('',ip),body(1)),e=>e.status===429&&/Usage limit/.test(e.message));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM exports').get().n,4);await jobs.createJob(request('', '8.8.8.8'),body(1));});
test('status reports queue position and estimated wait for exports that have not started',async()=>{process.env.MAX_CONCURRENT_JOBS='2';const made=[];for(let i=0;i<4;i++){made.push(await jobs.createJob(request('', '30.0.0.'+i),body(3)));sqlite.prepare('UPDATE exports SET next_run=?,created=? WHERE id=?').run(1000+i,1000+i,made[i].id);}const row=id=>sqlite.prepare('SELECT * FROM exports WHERE id=?').get(id);let first=await jobs.status(row(made[0].id)),last=await jobs.status(row(made[3].id));assert.equal(first.queuePosition,1);assert.equal(last.queuePosition,4);assert.equal(last.startSeconds,Math.ceil(Math.floor(3/2)*capacity.SECONDS_PER_IMAGE));assert.equal(last.capacity,2);assert.equal(last.busy,true);assert.equal(last.queueJobs,3);assert(last.etaSeconds>first.etaSeconds-1);await worker.tick(false);const started=await jobs.status(row(made[0].id));assert.equal(started.state,'downloading');assert.equal(started.queuePosition,null);assert.equal(started.startSeconds,null);assert.equal((await jobs.status(row(made[3].id))).queuePosition,3);process.env.MAX_CONCURRENT_JOBS='10';const relaxed=await jobs.status(row(made[3].id));assert.equal(relaxed.busy,false);assert.equal(relaxed.startSeconds,0);});
test('queue estimates share capacity fairly between active exports',()=>{const job={state:'downloading',total:100,cursor:0,bytes:0};const alone=capacity.queueEstimate(job,{active:1,ahead:0,waitingAhead:0,shared:0},10);const crowded=capacity.queueEstimate(job,{active:30,ahead:0,waitingAhead:0,shared:2900},10);assert.equal(alone.busy,false);assert.equal(crowded.busy,true);assert(crowded.etaSeconds>alone.etaSeconds*2);assert.equal(alone.queuePosition,null);assert.equal(capacity.queueEstimate({...job,state:'complete'},{active:0,ahead:0,waitingAhead:0,shared:0}).etaSeconds,null);});
test('image download with a declared length keeps one buffer and handles length mismatches',async()=>{const data=new Uint8Array(5000).map((_,i)=>i%251);const respond=(length)=>async()=>new Response(data,{headers:{'Content-Type':'image/png','Content-Length':String(length)}});for(const length of [5000,4000,6000]){globalThis.fetch=respond(length);const image=await downloader.download(good);assert.equal(image.bytes.length,5000);assert.deepEqual(Buffer.from(image.bytes),Buffer.from(data));}globalThis.fetch=async()=>new Response(data,{headers:{'Content-Type':'image/png'}});assert.equal((await downloader.download(good)).bytes.length,5000);});

const downloadRoute=await import(load('app/api/jobs/download/route.ts'));
test('same signed URL resumes exact ZIP bytes after two minutes and expires after one hour',async()=>{
 const b=body(1),j=await jobs.createJob(request(),b);await worker.tick(false);await worker.tick(false);
 const realNow=Date.now,now=realNow();
 try{
  Date.now=()=>now;
  const link=await caps.downloadLink(await jobs.getJob(request(b.key),j.id),1,origin);
  assert.equal(link.expiresInSeconds,3600);
  const full=await downloadRoute.GET(new Request(link.url)),etag=full.headers.get('etag');
  const archive=Buffer.from(await full.arrayBuffer());
  for(const elapsed of [121000,3599999]){
   Date.now=()=>now+elapsed;
   const resumed=await downloadRoute.GET(new Request(link.url,{headers:{Range:'bytes=20-','If-Range':etag}}));
   assert.equal(resumed.status,206);assert.deepEqual(Buffer.from(await resumed.arrayBuffer()),archive.subarray(20));
  }
  Date.now=()=>now+3600000;
  assert.equal((await downloadRoute.GET(new Request(link.url,{headers:{Range:'bytes=20-'}}))).status,403);
 }finally{Date.now=realNow;}
});
test('download capability is capped by package expiry and rejects minting after expiry',async()=>{
 const {b,j}=await readyPaid(),realNow=Date.now,now=realNow();
 try{
  Date.now=()=>now;
  sqlite.prepare("UPDATE exports SET payment_intent='pi_verified',expires=? WHERE id=?").run(now+30000,j.id);
  const job=await jobs.getJob(request(b.key),j.id),link=await caps.downloadLink(job,1,origin),token=new URL(link.url).searchParams.get('token');
  assert.equal(link.expiresInSeconds,30);assert.equal((await caps.downloadAccess(token)).job.id,j.id);
  Date.now=()=>now+30000;await assert.rejects(caps.downloadAccess(token),e=>e.status===403);
  await assert.rejects(caps.downloadLink(job,1,origin),e=>e.status===410);
 }finally{Date.now=realNow;}
});
test('issued download capabilities recheck payment and package revocation on every request',async()=>{
 const {b,j}=await readyPaid();sqlite.prepare("UPDATE exports SET payment_intent='pi_verified' WHERE id=?").run(j.id);
 const link=await caps.downloadLink(await jobs.getJob(request(b.key),j.id),1,origin),token=new URL(link.url).searchParams.get('token');
 sqlite.prepare('UPDATE exports SET payment_intent=NULL WHERE id=?').run(j.id);
 await assert.rejects(caps.downloadAccess(token),e=>e.status===403);
 sqlite.prepare("UPDATE exports SET payment_intent='pi_verified',state='expired' WHERE id=?").run(j.id);
 await assert.rejects(caps.downloadAccess(token),e=>e.status===403);
});
const {crc32}=await import('../lib/export.mjs');
function verifyArchive(bytes,images){
 const end=bytes.length-22;assert.equal(bytes.readUInt32LE(end),0x06054b50);const count=bytes.readUInt16LE(end+10);assert.equal(count,images+1);
 let cursor=bytes.readUInt32LE(end+16),names=[];
 for(let n=0;n<count;n++){assert.equal(bytes.readUInt32LE(cursor),0x02014b50);const crc=bytes.readUInt32LE(cursor+16),size=bytes.readUInt32LE(cursor+24),len=bytes.readUInt16LE(cursor+28),offset=bytes.readUInt32LE(cursor+42),name=bytes.subarray(cursor+46,cursor+46+len).toString();names.push(name);assert.equal(bytes.readUInt32LE(offset),0x04034b50);const start=offset+30+bytes.readUInt16LE(offset+26);assert.equal(crc32(bytes.subarray(start,start+size)),crc);cursor+=46+len;}
 assert.equal(names.filter(n=>n==='manifest.csv').length,1);assert.equal(new Set(names).size,count);
}
test('large job produces one streamed ZIP with valid offsets and CRC across internal storage segments',async()=>{
 const b=body(3),j=await jobs.createJob(request(),b);const image=Buffer.alloc(11000000,7);Buffer.from([137,80,78,71,13,10,26,10]).copy(image);
 globalThis.fetch=async()=>new Response(image,{headers:{'Content-Type':'image/png'}});
 for(let n=0;n<6;n++)await worker.tick(false);
 const ready=await jobs.getJob(request(b.key),j.id);assert.equal(ready.state,'complete');assert.equal(ready.parts,3);
 const status=await jobs.status(ready);assert.equal(status.parts.length,1);assert.equal(status.parts[0].images,3);
 const link=await jobs.jobAction(request(b.key),ready,'download');const response=await downloadRoute.GET(new Request(link.url));assert.equal(response.status,200);assert(!response.headers.get('content-disposition').includes('-part-'));
 const archive=Buffer.from(await response.arrayBuffer());assert.equal(archive.length,Number(response.headers.get('content-length')));verifyArchive(archive,3);
 const stored=Buffer.concat(sqlite.prepare('SELECT object_key FROM export_parts WHERE job_id=? ORDER BY part').all(j.id).map(p=>objects.get(p.object_key).data));
 const expected={bytes:stored.length,sha256:createHash('sha256').update(stored).digest('hex')};
 assert.deepEqual(await verifyDownload(await downloadRoute.GET(new Request(link.url)),expected),expected);
});
test('interrupted segment checkpoint resumes without duplicate files',async()=>{
 const b=body(2),j=await jobs.createJob(request(),b);await worker.tick(false);await worker.tick(false);
 const put=environment.BUCKET.put;let interrupted=false;environment.BUCKET.put=async(key,data,opts)=>{await put(key,data,opts);if(key.includes('/zip-state/')&&!interrupted){interrupted=true;throw Error('Interrupted checkpoint commit');}};
 await worker.tick(false);assert.equal((await jobs.getJob(request(b.key),j.id)).parts,0);environment.BUCKET.put=put;sqlite.prepare('UPDATE exports SET next_run=0').run();await worker.tick(false);
 const ready=await jobs.getJob(request(b.key),j.id);assert.equal(ready.state,'complete');const link=await jobs.jobAction(request(b.key),ready,'download');const response=await downloadRoute.GET(new Request(link.url));verifyArchive(Buffer.from(await response.arrayBuffer()),2);
});
test('legacy multipart export is repacked from saved images before issuing one download',async()=>{
 const b=body(2),j=await jobs.createJob(request(),b);await worker.tick(false);await worker.tick(false);await worker.tick(false);
 await environment.BUCKET.delete('exports/'+j.id+'/zip-state/1.json');sqlite.prepare('UPDATE exports SET parts=2 WHERE id=?').run(j.id);sqlite.prepare("INSERT INTO export_parts(id,job_id,part,object_key,bytes,images) VALUES(?,?,2,'legacy',100,1)").run(j.id+':2',j.id);
 const ready=await jobs.getJob(request(b.key),j.id),expiry=ready.expires;assert.deepEqual(await jobs.jobAction(request(b.key),ready,'download'),{preparing:true});await worker.tick(false);
 const current=await jobs.getJob(request(b.key),j.id);assert.equal(current.state,'complete');assert.equal(current.expires,expiry);assert.equal(fetches.length,2);const link=await jobs.jobAction(request(b.key),current,'download');verifyArchive(Buffer.from(await (await downloadRoute.GET(new Request(link.url))).arrayBuffer()),2);
});
test('a failed packing attempt cannot serve an incomplete archive through an earlier signed link',async()=>{const {b,j}=await readyPaid();sqlite.prepare("UPDATE exports SET payment_intent='pi_verified' WHERE id=?").run(j.id);const link=await caps.downloadLink(await jobs.getJob(request(b.key),j.id),1,origin);sqlite.prepare("UPDATE exports SET state='failed' WHERE id=?").run(j.id);await assert.rejects(caps.downloadAccess(new URL(link.url).searchParams.get('token')),e=>e.status===403);await assert.rejects(caps.downloadLink(await jobs.getJob(request(b.key),j.id),1,origin),e=>e.status===409);});

test('download supports exact ranges, suffixes, HEAD, invalid ranges and If-Range',async()=>{
 const b=body(2),j=await jobs.createJob(request(),b);for(let i=0;i<3;i++)await worker.tick(false);
 const link=await jobs.jobAction(request(b.key),await jobs.getJob(request(b.key),j.id),'download');
 const full=await downloadRoute.GET(new Request(link.url));const archive=Buffer.from(await full.arrayBuffer());
 const before=sqlite.prepare("SELECT SUM(value) n FROM usage_limits WHERE id LIKE 'egress:%'").get().n;
 const head=await downloadRoute.HEAD(new Request(link.url,{method:'HEAD'}));assert.equal(head.headers.get('content-length'),String(archive.length));assert.equal(await head.text(),'');
 assert.equal(sqlite.prepare("SELECT SUM(value) n FROM usage_limits WHERE id LIKE 'egress:%'").get().n,before);
 for(const [range,start,end] of [['bytes=5-24',5,25],['bytes=-12',archive.length-12,archive.length],['bytes=20-',20,archive.length]]){
  const r=await downloadRoute.GET(new Request(link.url,{headers:{Range:range}}));assert.equal(r.status,206);assert.deepEqual(Buffer.from(await r.arrayBuffer()),archive.subarray(start,end));
 }
 for(const range of ['bytes=999999-','bytes=5-2','bytes=0-1,3-4','bytes=-0']){const r=await downloadRoute.GET(new Request(link.url,{headers:{Range:range}}));assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */'+archive.length);}
 const r=await downloadRoute.GET(new Request(link.url,{headers:{Range:'bytes=5-24','If-Range':'"old"'}}));assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),archive);
});
test('cancelled download charges only streamed chunks and can resume across segment boundaries',async()=>{
 const b=body(3),j=await jobs.createJob(request(),b);const image=Buffer.alloc(11000000,7);Buffer.from([137,80,78,71]).copy(image);globalThis.fetch=async()=>new Response(image,{headers:{'Content-Type':'image/png'}});
 for(let n=0;n<6;n++)await worker.tick(false);
 const ready=await jobs.getJob(request(b.key),j.id),link=await jobs.jobAction(request(b.key),ready,'download');
 const r=await downloadRoute.GET(new Request(link.url));const reader=r.body.getReader();const first=await reader.read();await reader.cancel();
 const values=sqlite.prepare("SELECT value FROM usage_limits WHERE id LIKE 'egress:%'").all();assert(values.every(x=>x.value===first.value.length));assert(first.value.length<=8388608);
 const parts=sqlite.prepare('SELECT * FROM export_parts ORDER BY part').all(),boundary=parts[0].bytes;
 const ranged=await downloadRoute.GET(new Request(link.url,{headers:{Range:`bytes=${boundary-7}-${boundary+11}`}}));assert.equal(ranged.status,206);
 const expected=Buffer.concat(parts.map(p=>objects.get(p.object_key).data));assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),expected.subarray(boundary-7,boundary+12));
});

test('missing first ZIP segment returns JSON 503 before a successful response is committed',async()=>{
 const b=body(1),j=await jobs.createJob(request(),b);await worker.tick();await worker.tick();
 const link=await jobs.jobAction(request(b.key),await jobs.getJob(request(b.key),j.id),'download');
 const part=sqlite.prepare('SELECT * FROM export_parts').get();objects.delete(part.object_key);
 const r=await downloadRoute.GET(new Request(link.url));assert.equal(r.status,503);assert.match(r.headers.get('content-type'),/json/);assert.match((await r.json()).error,/segment is unavailable/);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM usage_limits WHERE id LIKE 'egress:%'").get().n,0);
});
test('exhausted download allowance returns HTTP 429 before streaming',async()=>{
 const b=body(1),j=await jobs.createJob(request(),b);await worker.tick();await worker.tick();
 const link=await jobs.jobAction(request(b.key),await jobs.getJob(request(b.key),j.id),'download');
 const day=Math.floor(Date.now()/86400000)*86400000;
 await guard.consume('egress:global:'+day,5000000000,5000000000,day+86400000);
 const r=await downloadRoute.GET(new Request(link.url));assert.equal(r.status,429);assert(r.headers.get('retry-after'));assert.match((await r.json()).error,/Usage limit/);
});
test('cancelling before the first read refunds both unused chunk reservations',async()=>{
 const b=body(1),j=await jobs.createJob(request(),b);await worker.tick();await worker.tick();
 const link=await jobs.jobAction(request(b.key),await jobs.getJob(request(b.key),j.id),'download');
 const r=await downloadRoute.GET(new Request(link.url));assert(r.headers.get('x-parcel-transfer-id'));await r.body.cancel();
 assert(sqlite.prepare("SELECT value FROM usage_limits WHERE id LIKE 'egress:%'").all().every(r=>r.value===0));
});
test('midstream storage failure records transfer ID and delivered bytes without capability tokens',async()=>{
 const b=body(1),j=await jobs.createJob(request(),b);const image=Buffer.alloc(11000000,7);Buffer.from([137,80,78,71]).copy(image);globalThis.fetch=async()=>new Response(image,{headers:{'Content-Type':'image/png'}});
 await worker.tick();await worker.tick();
 const link=await jobs.jobAction(request(b.key),await jobs.getJob(request(b.key),j.id),'download');
 const r=await downloadRoute.GET(new Request(link.url));const reader=r.body.getReader();const first=await reader.read();
 environment.BUCKET.get=async()=>null;await assert.rejects(reader.read(),/segment is unavailable/);
 const event=sqlite.prepare("SELECT * FROM error_events WHERE code='zip_stream_failed'").get();const detail=JSON.parse(event.detail);
 assert.equal(event.job_id,j.id);assert.equal(detail.delivered,first.value.length);assert.equal(detail.transferId,r.headers.get('x-parcel-transfer-id'));assert.equal(detail.status,503);assert(!event.detail.includes('token'));assert(!event.detail.includes(b.key));
});
for(const outcome of ['complete','partial','failed'])test('notification queue sends the correct '+outcome+' outcome',async()=>{
 configureEmail();const b=body(2);b.email='user@example.test';
 if(outcome!=='complete')b.items[0].url='https://cdn.shopify.com/missing.png';
 if(outcome==='failed')b.items[1].url='https://cdn.shopify.com/missing2.png';
 const j=await jobs.createJob(request(),b);for(let i=0;i<3;i++)await worker.tick(false);
 assert.equal((await jobs.getJob(request(b.key),j.id)).state,outcome);
 let message;globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://api.resend.com/emails');message=JSON.parse(options.body);return Response.json({id:'mock-notification'});};
 await notifications.emailTick();assert(message);
 assert.match(message.subject,outcome==='failed'?/needs attention/:outcome==='partial'?/partially ready/:/export is ready/);
 if(outcome==='failed')assert.doesNotMatch(message.text,/Your ZIP is ready|Payment is required/);
 assert.equal(sqlite.prepare('SELECT state FROM email_outbox WHERE job_id=?').get(j.id).state,'sent');
});

// Payment failure regressions: providers are mocked; D1 uses real SQLite migrations.
test('lost Stripe creation pins provider and worker recovers the identical request',async()=>{
 process.env.PAYPAL_CLIENT_ID='fixture';process.env.PAYPAL_CLIENT_SECRET='fixture';
 const {b,j}=await readyPaid();let first=true;const payloads=[];
 globalThis.fetch=async(url,opts)=>{
  assert(String(url).includes('stripe.com'),'Must not contact a second provider');
  if(opts?.method==='POST'){payloads.push(opts.body.toString());assert.equal(opts.headers['Idempotency-Key'],'parcel-job-'+j.id);if(first){first=false;throw Error('Response lost');}return Response.json({id:'cs_recovered',url:'https://checkout.stripe.com/recovered'});}
  return Response.json({payment_status:'unpaid',status:'open'});
 };
 await assert.rejects(jobs.jobAction(request(b.key),j,'checkout',{provider:'stripe'}));
 let row=await jobs.getJob(request(b.key),j.id);assert(row.checkout_started);assert.equal(row.session,null);
 assert.equal((await jobs.status(row)).paymentProvider,'stripe');
 await assert.rejects(jobs.jobAction(request(b.key),row,'checkout',{provider:'paypal'}),e=>e.status===409);
 await worker.tick(false);row=await jobs.getJob(request(b.key),j.id);
 assert.equal(row.session,'cs_recovered');assert.equal(payloads.length,2);assert.equal(payloads[0],payloads[1]);
});

test('lost PayPal creation recovers through same provider despite a changed return origin',async()=>{
 process.env.PAYPAL_CLIENT_ID='fixture';process.env.PAYPAL_CLIENT_SECRET='fixture';
 const {b,j}=await readyPaid();const payloads=[];let first=true;
 globalThis.fetch=async(url,opts)=>{
  assert(!String(url).includes('stripe.com'));
  if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fixture'});
  payloads.push(opts.body);assert.equal(opts.headers['PayPal-Request-Id'],'o-'+j.id);
  if(first){first=false;throw Error('Response lost');}
  return Response.json({id:'ORDER_RECOVERED',links:[{rel:'payer-action',href:'https://www.paypal.com/checkoutnow?token=ORDER_RECOVERED'}]});
 };
 await assert.rejects(jobs.jobAction(request(b.key),j,'checkout',{provider:'paypal'}));
 const row=await jobs.getJob(request(b.key),j.id);
 await assert.rejects(jobs.checkoutJob(row,origin),e=>e.status===409);
 const req=new Request('https://changed.example',{headers:{'x-export-key':b.key}});
 await jobs.jobAction(req,row,'checkout',{provider:'paypal'});
 assert.equal(payloads[0],payloads[1]);assert.equal(sqlite.prepare('SELECT session FROM exports').get().session,'ORDER_RECOVERED');
});

test('uncertain checkout older than safe replay window is flagged without another provider call',async()=>{
 const {b,j}=await readyPaid();globalThis.fetch=async()=>{throw Error('Response lost');};
 await assert.rejects(jobs.jobAction(request(b.key),j,'checkout',{provider:'stripe'}));
 sqlite.prepare('UPDATE exports SET checkout_started=?').run(Date.now()-24*3600000);
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Must not recreate');};
 await worker.tick(false);
 assert.equal(calls,0);assert.equal(sqlite.prepare('SELECT checkout_review FROM exports').get().checkout_review,1);
});

test('late PayPal settlement after file cleanup is recorded and refunded once',async()=>{
 process.env.PAYPAL_CLIENT_ID='fixture';process.env.PAYPAL_CLIENT_SECRET='fixture';
 const {j}=await readyPaid();sqlite.prepare("UPDATE exports SET payment_provider='paypal',session='ORDER_LATE',expires=?").run(Date.now()-1);
 let settled=false,captures=0,refunds=0;
 globalThis.fetch=async(url,opts)=>{
  if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fixture'});
  if(String(url).endsWith('/refund')){refunds++;assert.equal(opts.headers['PayPal-Request-Id'],'r-'+j.id);return Response.json({id:'REFUND_LATE',status:'COMPLETED'});}
  if(String(url).endsWith('/capture'))captures++;
  return Response.json({intent:'CAPTURE',status:settled?'COMPLETED':'APPROVED',purchase_units:[{custom_id:j.id,reference_id:j.hash,amount:{currency_code:'USD',value:'9.00'},...(settled?{payments:{captures:[{id:'LATE_CAPTURE',status:'COMPLETED',amount:{currency_code:'USD',value:'9.00'}}]}}:{})}]});
 };
 await worker.cleanup();await worker.cleanup();assert.equal(sqlite.prepare('SELECT state FROM exports').get().state,'expired');
 await worker.tick(false);assert.equal(captures,0);
 settled=true;sqlite.prepare('UPDATE exports SET next_run=0').run();await worker.tick(false);
 let row=sqlite.prepare('SELECT * FROM exports').get();assert.equal(row.payment_intent,'LATE_CAPTURE');assert.equal(row.refund_state,'pending');assert.equal(row.state,'expired');
 await worker.tick(false);await worker.tick(false);
 assert.equal(refunds,1);assert.equal(sqlite.prepare('SELECT refund_state FROM exports').get().refund_state,'refunded');
});

test('Stripe payment discovered after expiry queues refund without reviving files',async()=>{
 const {j}=await readyPaid();sqlite.prepare("UPDATE exports SET session='cs_late',expires=?,state='expired'").run(Date.now()-1);
 globalThis.fetch=async()=>Response.json({payment_status:'paid',metadata:{job_hash:j.hash,export_id:j.id},amount_total:j.amount,currency:'usd',payment_intent:'pi_late'});
 await worker.tick(false);const row=sqlite.prepare('SELECT * FROM exports').get();
 assert.equal(row.payment_intent,'pi_late');assert.equal(row.refund_state,'pending');assert.equal(row.state,'expired');
});

test('previously delivered paid exports are not refunded merely because retention ends',async()=>{
 const {j}=await readyPaid();sqlite.prepare("UPDATE exports SET session='cs_paid',payment_intent='pi_paid',expires=?").run(Date.now()-1);
 await worker.cleanup();await worker.cleanup();await worker.tick(false);
 assert.equal(sqlite.prepare('SELECT refund_state FROM exports').get().refund_state,null);assert.equal(fetches.length,0);
});

const opsRoute=await import(load('app/api/ops/route.ts'));
test('operator alerts include billing and email cases with authenticated resolution',async()=>{
 process.env.PARCEL_WORKER_SECRET='ops-fixture';
 const b=body(1);b.email='reader@example.test';const j=await jobs.createJob(request(),b);
 sqlite.prepare("UPDATE exports SET payment_intent='pi_fixture',review_id='case-fixture',checkout_review=0").run();
 sqlite.prepare("UPDATE email_outbox SET state='failed'").run();
 const auth={Authorization:'Bearer ops-fixture'};
 const read=async()=> (await opsRoute.GET(new Request(origin,{headers:auth}))).json();
 let result=await read();assert.equal(result.alerts.billingReviews,1);assert.equal(result.alerts.failedEmails,1);
 const denied=await opsRoute.POST(new Request(origin,{method:'POST',body:JSON.stringify({id:j.id,kind:'billing'})}));assert.equal(denied.status,403);
 for(const kind of ['billing','email'])assert.equal((await opsRoute.POST(new Request(origin,{method:'POST',headers:auth,body:JSON.stringify({id:j.id,kind})}))).status,200);
 result=await read();assert.equal(result.alerts.billingReviews,0);assert.equal(result.alerts.failedEmails,0);
 assert.equal(sqlite.prepare('SELECT payment_intent FROM exports').get().payment_intent,'pi_fixture');
 await jobs.jobAction(request(b.key),await jobs.getJob(request(b.key),j.id),'review');assert.equal((await read()).alerts.billingReviews,1);
});

test('failed email alert survives expiry while encrypted recipient data is erased',async()=>{
 const b=body(1);b.email='reader@example.test';await jobs.createJob(request(),b);
 sqlite.prepare("UPDATE email_outbox SET state='failed'").run();sqlite.prepare('UPDATE exports SET expires=?').run(Date.now()-1);
 await worker.cleanup();await worker.cleanup();const row=sqlite.prepare('SELECT * FROM email_outbox').get();
 assert.equal(row.state,'failed');assert.equal(row.payload,null);assert.equal(row.message,null);
});

test('capture crossing expiry queues refund using commit-time availability',async()=>{
 process.env.PAYPAL_CLIENT_ID='fixture';process.env.PAYPAL_CLIENT_SECRET='fixture';
 const {j}=await readyPaid();sqlite.prepare("UPDATE exports SET payment_provider='paypal',session='CROSSING'").run();
 const realNow=Date.now,initial=realNow();
 const unit={custom_id:j.id,reference_id:j.hash,amount:{currency_code:'USD',value:'9.00'}};
 try{
 globalThis.fetch=async(url)=>{
  if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fixture'});
  if(String(url).endsWith('/capture')){Date.now=()=>initial+25*3600000;return Response.json({status:'COMPLETED',purchase_units:[{...unit,payments:{captures:[{id:'CROSSED',status:'COMPLETED',amount:unit.amount}]}}]});}
  return Response.json({intent:'CAPTURE',status:'APPROVED',purchase_units:[unit]});
 };
 await worker.tick(false);assert.equal(sqlite.prepare('SELECT refund_state FROM exports').get().refund_state,'pending');
 }finally{Date.now=realNow;}
});

test('duplicate payment confirmation after expiry does not refund a previously recorded purchase',async()=>{
 const {j}=await readyPaid();sqlite.prepare("UPDATE exports SET session='cs_paid',payment_intent='pi_paid',expires=?").run(Date.now()-1);
 globalThis.fetch=async()=>Response.json({payment_status:'paid',metadata:{job_hash:j.hash,export_id:j.id},amount_total:j.amount,currency:'usd',payment_intent:'pi_paid'});
 await jobs.confirmPayment(sqlite.prepare('SELECT * FROM exports').get());
 assert.equal(sqlite.prepare('SELECT refund_state FROM exports').get().refund_state,null);
});
