// Agency plan, Phase 2: Stripe subscription checkout, activation (browser return and worker recovery), status refresh
// with cache and outage fallback, portal, resubscribe, disputes and abandoned checkouts — against a small fake Stripe.
//
// Real-Stripe note for Phase 6: test clocks only attach to customers created WITH the clock, so create the customer
// first (POST /v1/customers with test_clock=...) and pass `customer` into Checkout; a customer Checkout creates on
// its own cannot be moved onto a clock afterwards.
import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const root=process.cwd();let sqlite,stripeState,calls;
const environment={};globalThis.__parcelEnv=environment;
const modules=new Map();
function load(file){file=path.resolve(root,file);if(modules.has(file))return modules.get(file);let source=fs.readFileSync(file,'utf8');source=source.replace(/from\s+(['"])([^'"]+)\1/g,(match,q,spec)=>{if(spec==='cloudflare:workers')return 'from '+JSON.stringify('data:text/javascript,export const env=globalThis.__parcelEnv;');if(spec.startsWith('.')){let p=path.resolve(path.dirname(file),spec);if(p.endsWith('.mjs'))return 'from '+JSON.stringify('file://'+p);if(!p.endsWith('.ts'))p+='.ts';return 'from '+JSON.stringify(load(p));}return match;});const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');modules.set(file,url);return url;}
const agency=await import(load('lib/agency.ts')),billing=await import(load('lib/agency-billing.ts')),worker=await import(load('lib/job-worker.ts'));
const checkoutRoute=await import(load('app/api/agency/checkout/route.ts')),sessionRoute=await import(load('app/api/agency/session/route.ts')),portalRoute=await import(load('app/api/agency/portal/route.ts')),resubRoute=await import(load('app/api/agency/resubscribe/route.ts'));
function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
const origin='https://parcel.test';
const request=(key,init={})=>new Request(origin+'/api/agency/x',{method:'POST',...init,headers:{'cf-connecting-ip':'1.2.3.4','content-type':'application/json',...(key===undefined?{}:{'x-agency-key':key}),...(init.headers||{})}});
const json=(key,body)=>request(key,{body:JSON.stringify(body)});
const row=id=>sqlite.prepare('SELECT * FROM agency_accounts WHERE id=?').get(id);
const periodStart=Math.floor(Date.now()/1000)-86400,periodEnd=periodStart+30*86400;
const sub=(over={})=>({id:'sub_1',status:'active',customer:'cus_1',cancel_at_period_end:false,current_period_start:periodStart,current_period_end:periodEnd,items:{data:[{}]},...over});
// Fake Stripe: records calls; state decides what Checkout Session / Subscription / charges look like.
function fakeStripe(){globalThis.fetch=async(url,opts={})=>{const u=String(url);calls.push({url:u,method:opts.method||'GET',body:opts.body?Object.fromEntries(new URLSearchParams(String(opts.body))):null,idem:opts.headers?.['Idempotency-Key']});if(stripeState.down)return new Response('{"error":"down"}',{status:503});const p=u.replace('https://api.stripe.com/v1/','');
 if(p==='checkout/sessions'&&opts.method==='POST')return Response.json({id:'cs_'+(++stripeState.sessions),url:'https://checkout.stripe.com/c/'+stripeState.sessions,status:'open'});
 if(p.startsWith('checkout/sessions/'))return Response.json({id:p.split('/')[2],client_reference_id:stripeState.sessionAccount,status:stripeState.sessionStatus,subscription:stripeState.sessionStatus==='complete'?'sub_1':null,customer:'cus_1',customer_details:{email:'owner@agency.test'}});
 if(p.startsWith('subscriptions/'))return Response.json(stripeState.subscription);
 if(p==='billing_portal/sessions')return Response.json({url:'https://billing.stripe.com/p/session_1'});
 if(p.startsWith('charges?'))return Response.json({data:stripeState.charges});
 return new Response('{"error":"unexpected"}',{status:404});};}
beforeEach(()=>{sqlite=new DatabaseSync(':memory:');for(const p of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+p,'utf8').replaceAll('--> statement-breakpoint',''));environment.DB={prepare:statement,async batch(s){sqlite.exec('BEGIN');try{const results=[];for(const v of s)results.push(v.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};environment.BUCKET={async list(){return {objects:[]};},async delete(){},async put(){},async head(){return null;},async get(){return null;}};
 process.env.AGENCY_ENABLED='1';process.env.STRIPE_SECRET_KEY='sk_test_fixture';process.env.STRIPE_AGENCY_PRICE_ID='price_fixture';process.env.EXPORT_SIGNING_SECRET='test-secret-test-secret-test-secret';process.env.PUBLIC_SITE_URL=origin;process.env.BACKGROUND_EXPORTS='1';
 stripeState={sessions:0,sessionStatus:'open',sessionAccount:null,subscription:sub(),charges:[],down:false};calls=[];fakeStripe();
 sqlite.prepare('INSERT INTO invite_codes(code,created) VALUES(?,?)').run('AGENCY-BETA',Date.now());});

test('billing is unavailable without a price id, even when the plan is on',async()=>{
 delete process.env.STRIPE_AGENCY_PRICE_ID;
 const r=await checkoutRoute.POST(json(undefined,{code:'AGENCY-BETA'}));assert.equal(r.status,503);
 assert.equal(sqlite.prepare('SELECT account_id FROM invite_codes').get().account_id,null);
});

test('checkout reserves the code, creates the account and key before Stripe, and sends the browser to Stripe',async()=>{
 const r=await checkoutRoute.POST(json(undefined,{code:' agency-beta ',email:'owner@agency.test'}));assert.equal(r.status,200);
 const body=await r.json();assert.match(body.key,/^[a-f0-9]{64}$/);assert.equal(body.url,'https://checkout.stripe.com/c/1');
 const account=row(body.accountId);assert.equal(account.status,'pending');assert.equal(account.stripe_session,'cs_1');assert.equal(account.email,'owner@agency.test');
 assert.equal(sqlite.prepare('SELECT account_id,used_at FROM invite_codes').get().account_id,body.accountId);
 const create=calls.find(c=>c.url.endsWith('/checkout/sessions'));
 assert.equal(create.body.mode,'subscription');assert.equal(create.body['line_items[0][price]'],'price_fixture');assert.equal(create.body.client_reference_id,body.accountId);
 assert.equal(create.body['consent_collection[terms_of_service]'],'required');assert.equal(create.body.billing_address_collection,'required');assert.equal(create.body.customer_email,'owner@agency.test');
 assert.equal(create.body.success_url,origin+'/agency/account?checkout=complete');assert.equal(create.idem,'agency-checkout-'+body.accountId);
 // the same code cannot be used again while that checkout is pending
 assert.equal((await checkoutRoute.POST(json(undefined,{code:'AGENCY-BETA'}))).status,404);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM agency_accounts').get().n,1);
});

test('bad codes and bad emails are refused without creating anything',async()=>{
 assert.equal((await checkoutRoute.POST(json(undefined,{code:'nope'}))).status,400);
 assert.equal((await checkoutRoute.POST(json(undefined,{code:'NOT-A-REAL-CODE'}))).status,404);
 assert.equal((await checkoutRoute.POST(json(undefined,{code:'AGENCY-BETA',email:'not-an-email'}))).status,400);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM agency_accounts').get().n,0);
 assert.equal(sqlite.prepare('SELECT account_id FROM invite_codes').get().account_id,null);
});

test('a Stripe failure during checkout releases the code and removes the pending account',async()=>{
 stripeState.down=true;
 const r=await checkoutRoute.POST(json(undefined,{code:'AGENCY-BETA'}));assert.notEqual(r.status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM agency_accounts').get().n,0);
 assert.equal(sqlite.prepare('SELECT account_id FROM invite_codes').get().account_id,null);
});

test('returning from Stripe activates the account through the session endpoint, once',async()=>{
 const {key,accountId}=await (await checkoutRoute.POST(json(undefined,{code:'AGENCY-BETA'}))).json();
 stripeState.sessionAccount=accountId;
 // still open: nothing changes
 let s=await (await sessionRoute.GET(request(key,{method:'GET'}))).json();assert.equal(s.status,'pending');assert.equal(s.canExport,false);
 stripeState.sessionStatus='complete';
 s=await (await sessionRoute.GET(request(key,{method:'GET'}))).json();
 assert.equal(s.status,'active');assert.equal(s.canExport,true);assert.equal(s.periodStart,periodStart*1000);assert.equal(s.periodEnd,periodEnd*1000);assert.equal(s.cancelAtPeriodEnd,false);assert.equal(s.email,'owner@agency.test');
 const account=row(accountId);assert.equal(account.stripe_customer,'cus_1');assert.equal(account.stripe_subscription,'sub_1');
 assert(sqlite.prepare('SELECT used_at FROM invite_codes').get().used_at>0);
 // the browser hitting the endpoint again does not re-activate (status is cached, no more Stripe calls)
 const before=calls.length;await sessionRoute.GET(request(key,{method:'GET'}));assert.equal(calls.length,before);
});

test('a session that belongs to another account is refused',async()=>{
 const {key}=await (await checkoutRoute.POST(json(undefined,{code:'AGENCY-BETA'}))).json();
 stripeState.sessionAccount='someone-else';stripeState.sessionStatus='complete';
 assert.equal((await sessionRoute.GET(request(key,{method:'GET'}))).status,409);
});

test('the worker finishes activation when the browser never returns',async()=>{
 const {accountId}=await (await checkoutRoute.POST(json(undefined,{code:'AGENCY-BETA'}))).json();
 stripeState.sessionAccount=accountId;stripeState.sessionStatus='complete';
 await billing.maintenance(Date.now());assert.equal(row(accountId).status,'pending'); // too fresh: not yet
 await billing.maintenance(Date.now()+billing.PENDING_RECOVERY_MS+1);
 assert.equal(row(accountId).status,'active');
 // maintenance runs inside the worker's cleanup
 sqlite.prepare("UPDATE agency_accounts SET status='pending',updated=? WHERE id=?").run(Date.now()-billing.PENDING_RECOVERY_MS-1,accountId);
 await worker.cleanup();assert.equal(row(accountId).status,'active');
});

test('an expired checkout frees the code; a checkout that never reached Stripe is released after an hour',async()=>{
 const {key,accountId}=await (await checkoutRoute.POST(json(undefined,{code:'AGENCY-BETA'}))).json();
 stripeState.sessionAccount=accountId;stripeState.sessionStatus='expired';
 assert.equal((await sessionRoute.GET(request(key,{method:'GET'}))).status,410);
 assert.equal(row(accountId),undefined);assert.equal(sqlite.prepare('SELECT account_id FROM invite_codes').get().account_id,null);
 const {id}=await agency.createAccount();sqlite.prepare('UPDATE agency_accounts SET updated=? WHERE id=?').run(Date.now()-billing.ABANDONED_CHECKOUT_MS-1,id);
 await billing.maintenance();assert.equal(row(id),undefined);
});

test('status refresh maps Stripe states, respects the cache and survives a Stripe outage for a day',async()=>{
 const {id,key}=await agency.createAccount({status:'active'});
 sqlite.prepare("UPDATE agency_accounts SET stripe_customer='cus_1',stripe_subscription='sub_1',status_checked_at=? WHERE id=?").run(Date.now()-billing.STATUS_CACHE_MS-1,id);
 stripeState.subscription=sub({status:'past_due'});
 let s=await (await sessionRoute.GET(request(key,{method:'GET'}))).json();assert.equal(s.status,'past_due');assert.equal(s.canExport,false);
 // cached: a change at Stripe is not seen until the cache ages out
 stripeState.subscription=sub({status:'active',cancel_at_period_end:true});
 s=await (await sessionRoute.GET(request(key,{method:'GET'}))).json();assert.equal(s.status,'past_due');
 sqlite.prepare('UPDATE agency_accounts SET status_checked_at=? WHERE id=?').run(Date.now()-billing.STATUS_CACHE_MS-1,id);
 s=await (await sessionRoute.GET(request(key,{method:'GET'}))).json();assert.equal(s.status,'active');assert.equal(s.cancelAtPeriodEnd,true);assert.equal(s.canExport,true);
 // canceled → free
 stripeState.subscription=sub({status:'canceled'});sqlite.prepare('UPDATE agency_accounts SET status_checked_at=? WHERE id=?').run(Date.now()-billing.STATUS_CACHE_MS-1,id);
 s=await (await sessionRoute.GET(request(key,{method:'GET'}))).json();assert.equal(s.status,'free');assert.equal(s.canExport,false);
 // outage: a recent active status is trusted; an old one fails closed with 503
 sqlite.prepare("UPDATE agency_accounts SET status='active',status_checked_at=? WHERE id=?").run(Date.now()-3600000,id);stripeState.down=true;
 s=await (await sessionRoute.GET(request(key,{method:'GET'}))).json();assert.equal(s.status,'active');
 sqlite.prepare('UPDATE agency_accounts SET status_checked_at=? WHERE id=?').run(Date.now()-billing.STALE_OK_MS-1,id);
 assert.equal((await sessionRoute.GET(request(key,{method:'GET'}))).status,503);
});

test('newer Stripe API shapes (period dates on the subscription item) are read too',()=>{
 const m=billing.mapSubscription({status:'trialing',customer:{id:'cus_9'},items:{data:[{current_period_start:1,current_period_end:2}]}});
 assert.deepEqual(m,{status:'active',periodStart:1000,periodEnd:2000,cancelAtPeriodEnd:0,customer:'cus_9'});
 assert.equal(billing.mapSubscription({status:'unpaid'}).status,'free');
 // flexible billing mode: the Customer Portal schedules a cancellation with cancel_at and leaves cancel_at_period_end false
 assert.equal(billing.mapSubscription({status:'active',cancel_at_period_end:false,cancel_at:2,items:{data:[{current_period_start:1,current_period_end:2}]}}).cancelAtPeriodEnd,1);
 assert.equal(billing.mapSubscription({status:'active',cancel_at_period_end:false,cancel_at:null,items:{data:[{current_period_start:1,current_period_end:2}]}}).cancelAtPeriodEnd,0);
 assert.equal(billing.mapSubscription({status:'active',cancel_at_period_end:true,items:{data:[{current_period_start:1,current_period_end:2}]}}).cancelAtPeriodEnd,1);
});

test('the daily sweep refreshes one stale account and suspends on a dispute',async()=>{
 const {id}=await agency.createAccount({status:'active'});
 sqlite.prepare("UPDATE agency_accounts SET stripe_customer='cus_1',stripe_subscription='sub_1',status_checked_at=? WHERE id=?").run(Date.now()-billing.SWEEP_INTERVAL_MS-1,id);
 stripeState.charges=[{id:'ch_1',disputed:true}];
 await billing.maintenance();
 const a=row(id);assert.equal(a.suspended,1);assert(Date.now()-a.status_checked_at<5000);
 assert.equal((await agency.summary(a)).status,'suspended');
 // a sweep failure pushes the next attempt out an hour instead of retrying every minute
 const other=await agency.createAccount({status:'active'});sqlite.prepare("UPDATE agency_accounts SET stripe_subscription='sub_2',status_checked_at=? WHERE id=?").run(Date.now()-billing.SWEEP_INTERVAL_MS-1,other.id);stripeState.down=true;
 await billing.maintenance();assert(row(other.id).status_checked_at>Date.now()-billing.SWEEP_INTERVAL_MS);
});

test('portal needs a Stripe customer; resubscribe reuses the customer and needs no code',async()=>{
 const fresh=await agency.createAccount({status:'active'});
 assert.equal((await portalRoute.POST(request(fresh.key))).status,409);
 const {id,key}=await agency.createAccount({status:'free'});
 sqlite.prepare("UPDATE agency_accounts SET stripe_customer='cus_1',status_checked_at=? WHERE id=?").run(Date.now(),id);
 const portal=await (await portalRoute.POST(request(key))).json();assert.equal(portal.url,'https://billing.stripe.com/p/session_1');
 assert.equal(calls.at(-1).body.return_url,origin+'/agency/account');
 const resub=await (await resubRoute.POST(request(key))).json();assert.match(resub.url,/^https:\/\/checkout\.stripe\.com\//);
 const create=calls.at(-1);assert.equal(create.body.customer,'cus_1');assert.equal(create.body.customer_email,undefined);assert.equal(row(id).status,'pending');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM invite_codes WHERE account_id IS NOT NULL').get().n,0);
 // an account with a live subscription cannot start a second one; a suspended account cannot resubscribe
 const active=await agency.createAccount({status:'active'});assert.equal((await resubRoute.POST(request(active.key))).status,409);
 sqlite.prepare('UPDATE agency_accounts SET suspended=1 WHERE id=?').run(active.id);sqlite.prepare("UPDATE agency_accounts SET status='free' WHERE id=?").run(active.id);
 assert.equal((await resubRoute.POST(request(active.key))).status,403);
 // a returning customer whose new checkout expires goes back to free, not deleted
 stripeState.sessionAccount=id;stripeState.sessionStatus='expired';
 assert.equal((await sessionRoute.GET(request(key,{method:'GET'}))).status,410);assert.equal(row(id).status,'free');
});

test('Stripe Tax and an explicit portal configuration are passed through when configured',async()=>{
 process.env.STRIPE_TAX='1';process.env.STRIPE_PORTAL_CONFIG_ID='bpc_fixture';
 await checkoutRoute.POST(json(undefined,{code:'AGENCY-BETA'}));
 let create=calls.find(c=>c.url.endsWith('/checkout/sessions'));assert.equal(create.body['automatic_tax[enabled]'],'true');assert.equal(create.body['customer_update[address]'],undefined);
 const {id,key}=await agency.createAccount({status:'free'});sqlite.prepare("UPDATE agency_accounts SET stripe_customer='cus_1',status_checked_at=? WHERE id=?").run(Date.now(),id);
 await resubRoute.POST(request(key));create=calls.at(-1);assert.equal(create.body['automatic_tax[enabled]'],'true');assert.equal(create.body['customer_update[address]'],'auto');
 sqlite.prepare("UPDATE agency_accounts SET status='active' WHERE id=?").run(id);await portalRoute.POST(request(key));assert.equal(calls.at(-1).body.configuration,'bpc_fixture');
 delete process.env.STRIPE_TAX;delete process.env.STRIPE_PORTAL_CONFIG_ID;
 sqlite.prepare('INSERT INTO invite_codes(code,created) VALUES(?,?)').run('AGENCY-TWO',Date.now());await checkoutRoute.POST(json(undefined,{code:'AGENCY-TWO'}));
 const plain=calls.filter(c=>c.url.endsWith('/checkout/sessions')).at(-1);assert.equal(plain.body['automatic_tax[enabled]'],undefined);
});
