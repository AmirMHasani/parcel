// Agency plan end-to-end drive (docs/agency-verification.md rows 1–26) against a LOCAL Worker:
//   1. cp .dev.vars.example .dev.vars (see docs/agency-runbook.md → "Local end-to-end run"), pnpm build
//   2. node scripts/e2e/fake-stripe.mjs &            (fake Stripe + fake Resend on :4242)
//   3. pnpm exec wrangler dev --port 8787 &           (then apply migrations locally and insert the three invite codes)
//   4. node scripts/e2e/agency-e2e.mjs                (needs playwright-core and Chrome; E2E_CHROME=<path> to override)
// It drives a real browser through checkout, exports, the cap, rollover, cancel/resubscribe, failed renewal, disputes,
// key rotation and email recovery, writing screenshots and results.json to E2E_OUT (default ./e2e-output).
// Never point it at production: it creates accounts and exports and manipulates the database directly.
// End-to-end drive of the Agency plan against the local Worker (wrangler dev) + fake Stripe/Resend.
import {chromium} from 'playwright-core';import {execFileSync} from 'node:child_process';import fs from 'node:fs';
const SITE=process.env.E2E_SITE||'http://127.0.0.1:8787',FAKE=process.env.E2E_FAKE_STRIPE||'http://127.0.0.1:4242',OUT=process.env.E2E_OUT||'e2e-output',REPO=process.cwd();fs.mkdirSync(OUT,{recursive:true});
const WORKER={authorization:'Bearer '+(process.env.PARCEL_WORKER_SECRET||'local-worker-secret-0123456789abcdef'),'content-type':'application/json'};
const results=[];const step=(id,name,ok,detail='')=>{results.push({id,name,ok,detail});console.log((ok?'PASS':'FAIL')+' '+id+' '+name+(detail?' — '+detail:''));};
function sql(q){let err;for(let i=0;i<5;i++){try{const out=execFileSync('corepack',['pnpm','exec','wrangler','d1','execute','DB','--local','--json','--command',q],{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','pipe']});try{return JSON.parse(out)[0].results;}catch{return out;}}catch(e){err=e;execFileSync('sleep',['1']);}}throw err;}
async function tick(n=1){let last;for(let i=0;i<n;i++){last=await (await fetch(SITE+'/api/worker/tick',{method:'POST',headers:WORKER,body:JSON.stringify({clean:i===0,ticks:2})})).json();if(!last.worked)break;}return last;}
async function tickUntil(pred,max=40){for(let i=0;i<max;i++){await tick(1);if(await pred())return true;await new Promise(r=>setTimeout(r,150));}return false;}
const api=async(path,opts={})=>{let r,err;for(let i=0;i<4;i++){try{r=await fetch(SITE+path,{...opts,headers:{'content-type':'application/json',origin:SITE,...(opts.headers||{})}});err=null;break;}catch(e){err=e;await new Promise(x=>setTimeout(x,800));}}if(err)throw err;let b;try{b=await r.json();}catch{b=null;}return {status:r.status,body:b,headers:r.headers};};
const admin=(path,body)=>fetch(FAKE+'/_admin/'+path,{method:'POST',body:JSON.stringify(body)}).then(r=>r.json());
const fakeState=()=>fetch(FAKE+'/_admin/state').then(r=>r.json());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch(process.env.E2E_CHROME?{executablePath:process.env.E2E_CHROME}:{channel:'chrome'});
const ctx=await browser.newContext({viewport:{width:1280,height:900}});ctx.setDefaultTimeout(20000);
const page=await ctx.newPage();page.on('dialog',d=>d.accept());
const shot=(name)=>page.screenshot({path:`${OUT}/${name}.png`,fullPage:true});
await tick(1); // heartbeat so the exporter is enabled
try{
// ---- 1. pricing page ----
await page.goto(SITE+'/pricing');const pricing=await page.content();
step('P1','pricing shows Agency copy verbatim as request-access',['For migration agencies and freelancers. All your clients, one flat price.','50 exports per month','Priority processing','White-label ZIPs and reports','Cancel anytime','Beta: request access','mailto:support@parcelexport.com'].every(t=>pricing.includes(t))&&!pricing.includes('There is no subscription')&&!/href="\/agency"/.test(pricing));
await shot('01-pricing-desktop');
for(const [w,n] of [[320,'320'],[390,'390']]){const p2=await (await browser.newContext({viewport:{width:w,height:800}})).newPage();for(const path of ['/pricing','/agency','/agency/account','/agency/recover']){await p2.goto(SITE+path);const over=await p2.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);step('P24-'+n+path,'no horizontal overflow at '+w+'px '+path,!over);await p2.screenshot({path:`${OUT}/24-${n}${path.replace(/\//g,'_')}.png`,fullPage:true});}await p2.context().close();}
// ---- 25. noindex / sitemap / robots ----
await page.goto(SITE+'/agency');const robotsMeta=await page.locator('meta[name="robots"]').first().getAttribute('content').catch(()=>null);
step('P25a','/agency is noindex',!!robotsMeta&&/noindex/.test(robotsMeta),String(robotsMeta));
const sitemap=await (await fetch(SITE+'/sitemap.xml')).text(),robots=await (await fetch(SITE+'/robots.txt')).text();
step('P25b','/agency absent from sitemap, disallowed in robots',!/\/agency/.test(sitemap)&&/Disallow: \/agency/.test(robots)&&/\/pricing/.test(sitemap));
// ---- 2. invite code → fake Stripe → account active ----
await page.fill('#invite-code','agency-beta');await page.fill('#billing-email','owner@agency.test');await page.click('button[type=submit]');
await page.waitForURL(/127\.0\.0\.1:4242\/pay\//);const payText=await page.textContent('body');
step('P2a','checkout created in subscription mode with tax on and Terms consent',/mode subscription/.test(payText)&&/tax true/.test(payText)&&/tos required/.test(payText)&&new RegExp(process.env.STRIPE_AGENCY_PRICE_ID||'price_').test(payText),payText.trim().slice(0,140));
const codeRow=sql("SELECT account_id FROM invite_codes WHERE code='AGENCY-BETA'")[0];step('P2b','code reserved before payment',!!codeRow.account_id);
await page.click('#pay');await page.waitForURL(/\/agency\/account/);
await page.waitForSelector('.agency-key',{timeout:20000});const shownKey=(await page.textContent('.agency-key')).trim();
step('P2c','key shown once after return',/^[a-f0-9]{64}$/.test(shownKey));
await page.waitForFunction(()=>/Active · renews on/.test(document.body.innerText),null,{timeout:20000}).catch(()=>{});
const acctText=await page.textContent('body');step('P2d','account active with 0 of 50 used',/Active · renews on/.test(acctText)&&/0\s*\/\s*50/.test(acctText.replace(/\n/g,' ')),acctText.replace(/\s+/g,' ').slice(0,200));
await shot('02-account-after-checkout');
const accountId=codeRow.account_id;const KEY=shownKey;
step('P2e','invite code marked used',!!sql("SELECT used_at FROM invite_codes WHERE code='AGENCY-BETA'")[0].used_at);
// ---- 3. reuse code ----
{const c2=await browser.newContext();const p3=await c2.newPage();await p3.goto(SITE+'/agency');await p3.fill('#invite-code','AGENCY-BETA');await p3.click('button[type=submit]');await p3.waitForSelector('.error');step('P3','reused code refused',/already been used|not valid/.test(await p3.textContent('.error')));await c2.close();}
// ---- 4. stranded browser: pay, never return ----
{const c4=await browser.newContext();const p4=await c4.newPage();await p4.goto(SITE+'/agency');await p4.fill('#invite-code','AGENCY-TWO');await p4.click('button[type=submit]');await p4.waitForURL(/\/pay\//);const sid=p4.url().split('/pay/')[1];
 await fetch(FAKE+'/pay/'+sid+'?action=pay',{redirect:'manual'}); await c4.close(); // paid, browser gone
 const acct2=sql("SELECT id,status,updated FROM agency_accounts WHERE id=(SELECT account_id FROM invite_codes WHERE code='AGENCY-TWO')")[0];
 sql(`UPDATE agency_accounts SET updated=${Date.now()-3*60000} WHERE id='${acct2.id}'`);await tick(1);
 const after=sql(`SELECT status FROM agency_accounts WHERE id='${acct2.id}'`)[0];step('P4','worker finishes activation for a stranded checkout',after.status==='active',acct2.status+' → '+after.status);}
// ---- 5. agency export from the homepage ----
await page.goto(SITE+'/');const csv=fs.readFileSync(REPO+'/public/sample-quick.csv','utf8');
await page.setInputFiles('input[type=file]',{name:'sample-quick.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
await page.waitForSelector('.agency-panel',{timeout:20000});const panel=await page.textContent('.agency-panel');
step('P5a','exporter shows the agency panel with exports left',/50 of 50/.test(panel.replace(/\s+/g,' ')),panel.replace(/\s+/g,' ').slice(0,120));
await page.fill('#client-name','Acme Store');await shot('05-exporter-agency-panel');
await page.click('button.primary:has-text("Prepare my ZIP")');await page.waitForSelector('.job-status',{timeout:20000});
const url5=page.url();const jobId=new URL(url5).searchParams.get('export');
const row5=sql(`SELECT amount,max_bytes,priority,agency_id,client_name,usage_slot FROM exports WHERE id='${jobId}'`)[0];
step('P5b','export is an agency export (amount 0, 1 GB, priority 1, client name, slot)',row5.amount===0&&row5.max_bytes===1000000000&&row5.priority===1&&row5.agency_id===accountId&&row5.client_name==='Acme Store'&&row5.usage_slot===1,JSON.stringify(row5));
step('P5c','Priority badge visible',(await page.locator('.priority-badge').count())>0);
const done=await tickUntil(async()=>sql(`SELECT state FROM exports WHERE id='${jobId}'`)[0].state==='complete',60);
step('P5d','worker completes the agency export',done,sql(`SELECT state,completed,failed FROM exports WHERE id='${jobId}'`)[0]&&JSON.stringify(sql(`SELECT state,completed,failed FROM exports WHERE id='${jobId}'`)[0]));
await page.reload();await page.waitForFunction(()=>/acme-store-images\.zip/.test(document.body.innerText),null,{timeout:20000}).catch(()=>{});
const body5=await page.textContent('body');step('P5e','results show client-named ZIP and Agency export label',/acme-store-images\.zip/.test(body5)&&/Agency export/.test(body5));await shot('05-results-agency');
const used5=sql(`SELECT used FROM usage_cycles WHERE account_id='${accountId}'`)[0]?.used;step('P5f','usage counted once',used5===1,'used='+used5);
// download header via the action endpoint
const exportKey=(()=>{try{return JSON.parse(fs.readFileSync('/dev/null','utf8'));}catch{return null;}})();
const link=await page.evaluate(async()=>{const saved=JSON.parse(localStorage.getItem('parcel-job'));const r=await fetch('/api/jobs/action',{method:'POST',headers:{'content-type':'application/json','x-export-key':saved.key},body:JSON.stringify({id:saved.id,action:'download'})});return r.json();});
const linkPath=(()=>{const u=new URL(link.url);return u.pathname+u.search;})();const head=await fetch(SITE+linkPath,{method:'HEAD'});const cd=head.headers.get('content-disposition');
step('P8','download header carries the client file name',head.status===200&&/filename="acme-store-images\.zip"/.test(cd||''),String(cd));
// ---- 6/7. queue order: agency first, aged one-time first (the Worker kicks processing on creation, so freeze the three jobs back to queued first) ----
{const mk=async(headers,ip,i)=>api('/api/jobs',{method:'POST',headers:{'cf-connecting-ip':ip,...headers},body:JSON.stringify({attempt:crypto.randomUUID(),key:'c'.repeat(64),items:[{handle:'q'+i,title:'Q',sku:'S'+i,position:1,url:'https://cdn.shopify.com/s/files/1/1104/4168/files/missing-'+i+'.png'}],options:{mode:'sku',folders:true,manifest:true}})});
 const a=await mk({},'10.1.1.1',1),b=await mk({},'10.1.1.2',2),c=await mk({'x-agency-key':KEY},'10.1.1.3',3);
 await sleep(3000);const t=Date.now();
 for(const [j,off] of [[a.body.id,-5000],[b.body.id,-4000],[c.body.id,0]])sql(`UPDATE exports SET state='queued',cursor=0,completed=0,failed=0,attempts=0,created=${t+off},next_run=${t+off},lease_until=0,lease_owner=NULL,last_error=NULL WHERE id='${j}'`);
 const pos=async(id,h)=>(await api('/api/jobs/status?id='+id,{headers:h})).body?.queuePosition;
 const posC=await pos(c.body.id,{'x-agency-key':KEY}),posA=await pos(a.body.id,{'x-export-key':'c'.repeat(64)}),posB=await pos(b.body.id,{'x-export-key':'c'.repeat(64)});
 step('P6','agency export is first in line ahead of older one-time exports',posC===1&&posA===2&&posB===3,`agency=${posC} one-time=${posA},${posB}`);
 sql(`UPDATE exports SET created=${t-11*60000},next_run=${t-11*60000} WHERE id='${a.body.id}'`);
 const posA2=await pos(a.body.id,{'x-export-key':'c'.repeat(64)}),posC2=await pos(c.body.id,{'x-agency-key':KEY});
 step('P7','a one-time export that waited 10 minutes moves ahead of the agency export',posA2===1&&posC2===2,`one-time=${posA2} agency=${posC2}`);
 for(const j of [a.body.id,b.body.id,c.body.id])sql(`UPDATE exports SET state='cancelled',usage_slot=0 WHERE id='${j}'`);sql(`UPDATE usage_cycles SET used=1 WHERE account_id='${accountId}'`);}
// ---- 10. zero-image failure gives the slot back ----
{const usedBefore=sql(`SELECT used FROM usage_cycles WHERE account_id='${accountId}'`)[0].used;
 const c=await api('/api/jobs',{method:'POST',headers:{'x-agency-key':KEY},body:JSON.stringify({attempt:crypto.randomUUID(),key:'g'.repeat(64),items:[{handle:'m',title:'M',sku:'M',position:1,url:'https://cdn.shopify.com/s/files/1/1104/4168/files/missing-zz.png'}],options:{mode:'sku',folders:true,manifest:true}})});
 await tickUntil(async()=>['failed','complete','partial'].includes(sql(`SELECT state FROM exports WHERE id='${c.body.id}'`)[0].state),60);await sleep(1500);
 const stC=sql(`SELECT state,completed,usage_slot FROM exports WHERE id='${c.body.id}'`)[0],usedAfter=sql(`SELECT used FROM usage_cycles WHERE account_id='${accountId}'`)[0].used;
 step('P10','zero-image failure releases the slot',stC.state==='failed'&&stC.usage_slot===0&&usedAfter===usedBefore,JSON.stringify({stC,usedBefore,usedAfter}));}
// ---- 9. cancel before start releases the slot (freeze the job back to queued first, since creation kicks processing) ----
{const before=sql(`SELECT used FROM usage_cycles WHERE account_id='${accountId}'`)[0].used;
 const c=await api('/api/jobs',{method:'POST',headers:{'x-agency-key':KEY},body:JSON.stringify({attempt:crypto.randomUUID(),key:'d'.repeat(64),items:[{handle:'z',title:'Z',sku:'Z',position:1,url:'https://cdn.shopify.com/s/files/1/1104/4168/files/z-missing.png'}],options:{mode:'sku',folders:true,manifest:true}})});
 await sleep(2500);sql(`UPDATE exports SET state='queued',cursor=0,completed=0,failed=0,attempts=0,lease_until=0,lease_owner=NULL,usage_slot=1 WHERE id='${c.body.id}'`);sql(`UPDATE usage_cycles SET used=${before+1} WHERE account_id='${accountId}'`);
 const r=await api('/api/jobs/action',{method:'POST',headers:{'x-agency-key':KEY},body:JSON.stringify({id:c.body.id,action:'cancel'})});
 const after=sql(`SELECT used FROM usage_cycles WHERE account_id='${accountId}'`)[0].used,row=sql(`SELECT state,usage_slot FROM exports WHERE id='${c.body.id}'`)[0];
 step('P9','cancel before start (via agency key) gives the slot back',r.status===200&&after===before&&row.state==='cancelled'&&row.usage_slot===0,JSON.stringify({status:r.status,before,after,row}));}
// ---- 11/12. warning at 45, refusal at 50 ----
sql(`UPDATE usage_cycles SET used=45 WHERE account_id='${accountId}'`);
let s=(await api('/api/agency/session',{headers:{'x-agency-key':KEY}})).body;step('P11','warning at 5 remaining',s.remaining===5&&s.warning===true,JSON.stringify({used:s.used,remaining:s.remaining,warning:s.warning}));
sql(`UPDATE usage_cycles SET used=50 WHERE account_id='${accountId}'`);
{const r=await api('/api/jobs',{method:'POST',headers:{'x-agency-key':KEY},body:JSON.stringify({attempt:crypto.randomUUID(),key:'e'.repeat(64),items:[{handle:'z',title:'Z',sku:'Z',position:1,url:'https://cdn.shopify.com/s/files/1/1104/4168/files/z.png'}],options:{mode:'sku',folders:true,manifest:true}})});
 step('P12a','51st export refused with reset date and one-time alternative',r.status===409&&/one-time price/.test(r.body?.error||'')&&/reset on/.test(r.body?.error||''),r.body?.error);
 await page.goto(SITE+'/');await page.setInputFiles('input[type=file]',{name:'sample-quick.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.waitForSelector('.agency-panel');
 step('P12b','exporter tells the agency the cap is reached and runs as a normal export',/used all 50/.test(await page.textContent('.agency-panel')));await shot('12-cap-reached');}
sql(`UPDATE usage_cycles SET used=1 WHERE account_id='${accountId}'`);
// ---- 13. period rollover (fake clock) ----
{const subs=(await fakeState()).subs;const mine=subs.find(x=>x.metadata?.agency_account===accountId);const ns=Math.floor(Date.now()/1000)+5;await admin('sub',{account:accountId,patch:{period_start:ns,period_end:ns+30*86400}});
 sql(`UPDATE agency_accounts SET period_end=${Date.now()-1000},status_checked_at=${Date.now()} WHERE id='${accountId}'`);
 s=(await api('/api/agency/session',{headers:{'x-agency-key':KEY}})).body; // cache is fresh, but the export path forces a refresh when the period has passed
 const r=await api('/api/jobs',{method:'POST',headers:{'x-agency-key':KEY},body:JSON.stringify({attempt:crypto.randomUUID(),key:'f'.repeat(64),items:[{handle:'z',title:'Z',sku:'Z',position:1,url:'https://cdn.shopify.com/s/files/1/1104/4168/files/z.png'}],options:{mode:'sku',folders:true,manifest:true}})});
 const acct=sql(`SELECT period_start FROM agency_accounts WHERE id='${accountId}'`)[0];const jr=r.body?.id?sql(`SELECT usage_period FROM exports WHERE id='${r.body.id}'`)[0]:null;const cycle=sql(`SELECT used FROM usage_cycles WHERE account_id='${accountId}' AND period_start=${ns*1000}`)[0];
 step('P13','period rollover picked up from Stripe; the export is counted in the new period',r.status===200&&acct.period_start===ns*1000&&jr?.usage_period===ns*1000&&!!cycle,JSON.stringify({status:r.status,period_start:acct.period_start,expected:ns*1000,usage_period:jr?.usage_period,cycle}));
 if(r.status===200)await api('/api/jobs/action',{method:'POST',headers:{'x-agency-key':KEY},body:JSON.stringify({id:r.body.id,action:'cancel'})});}
// ---- 14/15. cancel at period end → ended → free ----
await admin('sub',{account:accountId,patch:{cancel_at_period_end:true}});sql(`UPDATE agency_accounts SET status_checked_at=0 WHERE id='${accountId}'`);
await page.goto(SITE+'/agency/account');await page.waitForFunction(()=>/cancels on/.test(document.body.innerText),null,{timeout:20000}).catch(()=>{});
step('P14','account page shows cancels-on after portal cancellation',/cancels on/.test(await page.textContent('body')));
await admin('sub',{account:accountId,patch:{status:'canceled'}});sql(`UPDATE agency_accounts SET status_checked_at=0 WHERE id='${accountId}'`);
await page.reload();await page.waitForFunction(()=>/No active subscription/.test(document.body.innerText),null,{timeout:20000}).catch(()=>{});
const freeText=await page.textContent('body');step('P15a','ended subscription shows as free with Resubscribe',/No active subscription/.test(freeText)&&/Resubscribe/.test(freeText));
{const r=await api('/api/jobs',{method:'POST',headers:{'x-agency-key':KEY},body:JSON.stringify({attempt:crypto.randomUUID(),key:'1'.repeat(64),items:[{handle:'z',title:'Z',sku:'Z',position:1,url:'https://cdn.shopify.com/s/files/1/1104/4168/files/z.png'}],options:{mode:'sku',folders:true,manifest:true}})});step('P15b','ended account cannot start agency exports',r.status===409&&/ended/.test(r.body?.error||''),r.body?.error);}
const oldDownload=await fetch(SITE+linkPath,{method:'HEAD'});step('P15c','earlier export still downloadable after the plan ended',oldDownload.status===200);
await shot('15-account-free');
// ---- 16. resubscribe ----
await page.click('button:has-text("Resubscribe")');await page.waitForURL(/\/pay\//);const payText16=await page.textContent('body');await page.click('#pay');await page.waitForURL(/\/agency\/account/);
await page.waitForFunction(()=>/Active · renews on/.test(document.body.innerText),null,{timeout:20000}).catch(()=>{});
step('P16','resubscribe without a code reactivates the account',/Active · renews on/.test(await page.textContent('body'))&&/mode subscription/.test(payText16));
// ---- 17/18. failed renewal → past due → fixed ----
await admin('sub',{account:accountId,patch:{status:'past_due'}});sql(`UPDATE agency_accounts SET status_checked_at=0 WHERE id='${accountId}'`);
{const r=await api('/api/jobs',{method:'POST',headers:{'x-agency-key':KEY},body:JSON.stringify({attempt:crypto.randomUUID(),key:'2'.repeat(64),items:[{handle:'z',title:'Z',sku:'Z',position:1,url:'https://cdn.shopify.com/s/files/1/1104/4168/files/z.png'}],options:{mode:'sku',folders:true,manifest:true}})});step('P17','past-due account gets 402 update-your-card',r.status===402,r.body?.error);
 await page.goto(SITE+'/agency/account');await page.waitForFunction(()=>/Payment failed/.test(document.body.innerText),null,{timeout:20000}).catch(()=>{});step('P17b','account page shows payment failed with Update card',/Payment failed/.test(await page.textContent('body'))&&(await page.locator('button:has-text("Update card")').count())>0);}
await admin('sub',{account:accountId,patch:{status:'active'}});sql(`UPDATE agency_accounts SET status_checked_at=0 WHERE id='${accountId}'`);
s=(await api('/api/agency/session',{headers:{'x-agency-key':KEY}})).body;step('P18','exports resume once the card is fixed',s.status==='active'&&s.canExport===true);
// ---- portal ----
await page.goto(SITE+'/agency/account');await page.waitForSelector('button:has-text("Manage billing")');await page.click('button:has-text("Manage billing")');await page.waitForURL(/\/portal\?/);
step('P14b','Manage billing opens the Stripe portal with the configuration',/customer cus_/.test(await page.textContent('body'))&&(await fakeState()).portals>=1);
// ---- 19. dispute → suspended via sweep ----
{const cust=(await fakeState()).subs.find(x=>x.metadata?.agency_account===accountId).customer;await admin('dispute',{customer:cust});sql(`UPDATE agency_accounts SET status_checked_at=${Date.now()-25*3600000} WHERE id='${accountId}'`);await tick(1);
 const a=sql(`SELECT suspended FROM agency_accounts WHERE id='${accountId}'`)[0];step('P19','daily sweep suspends a disputed account',a.suspended===1);
 const r=await api('/api/jobs',{method:'POST',headers:{'x-agency-key':KEY},body:JSON.stringify({attempt:crypto.randomUUID(),key:'3'.repeat(64),items:[{handle:'z',title:'Z',sku:'Z',position:1,url:'https://cdn.shopify.com/s/files/1/1104/4168/files/z.png'}],options:{mode:'sku',folders:true,manifest:true}})});step('P19b','suspended account refused with 403',r.status===403);
 sql(`UPDATE agency_accounts SET suspended=0 WHERE id='${accountId}'`);}
// ---- 20. rotate key ----
await page.goto(SITE+'/agency/account');await page.waitForSelector('button:has-text("Create a new key")');await page.click('button:has-text("Create a new key")');await page.waitForSelector('.agency-key');const newKey=(await page.textContent('.agency-key')).trim();
step('P20','rotation issues a new key and kills the old one',newKey!==KEY&&(await api('/api/agency/session',{headers:{'x-agency-key':KEY}})).status===404&&(await api('/api/agency/session',{headers:{'x-agency-key':newKey}})).status===200);
// ---- 21. recovery by email ----
await page.goto(SITE+'/agency/recover');await page.fill('#recover-email','owner@agency.test');await page.click('button[type=submit]');await page.waitForSelector('.notice');
const emails=(await fakeState()).emails;const mail=emails.at(-1);const token=mail?.text?.match(/recover=([a-f0-9]{64})/)?.[1];
step('P21a','recovery email sent with a one-hour link',!!token&&mail.to==='owner@agency.test'&&!mail.text.includes(newKey));
const nonMatch=(await fakeState()).emails.length;await api('/api/agency/recover',{method:'POST',body:JSON.stringify({email:'stranger@nowhere.test'})});step('P21b','non-matching email gets the same answer and no email',(await fakeState()).emails.length===nonMatch);
{const c21=await browser.newContext();const p21=await c21.newPage();await p21.goto(SITE+'/agency/account?recover='+token);await p21.waitForSelector('.agency-key');const recovered=(await p21.textContent('.agency-key')).trim();
 step('P21c','recovery link issues a new key in a fresh browser; previous key dies; link is single-use',recovered!==newKey&&(await api('/api/agency/session',{headers:{'x-agency-key':newKey}})).status===404&&(await api('/api/agency/session',{headers:{'x-agency-key':recovered}})).status===200&&(await api('/api/agency/recover/redeem',{method:'POST',body:JSON.stringify({token})})).status===404);
 await p21.screenshot({path:OUT+'/21-recovered-key.png',fullPage:true});await c21.close();
 // history + open link via agency key in that fresh browser? use API: exports list
 const list=(await api('/api/agency/exports',{headers:{'x-agency-key':recovered}})).body;step('P5g','export history lists this period\'s exports with file names (the Acme export belongs to the earlier period after the rollover)',Array.isArray(list?.exports)&&list.exports.length>=1&&list.exports.every(e=>/-images\.zip$/.test(e.fileName)),JSON.stringify(list?.exports?.map(e=>e.fileName)));
 const open=await api('/api/jobs/status?id='+jobId,{headers:{'x-agency-key':recovered}});step('P5h','agency key opens the account\'s export without its own recovery key',open.status===200&&open.body.id===jobId);}
// ---- 22. brute force ----
{let last;for(let i=0;i<12;i++)last=await api('/api/agency/session',{headers:{'x-agency-key':'9'.repeat(64),'cf-connecting-ip':'77.7.7.7'}});step('P22','eleven wrong keys from one network end in 429',last.status===429);}
// ---- 26. ops ----
{const o=await (await fetch(SITE+'/api/ops',{headers:WORKER})).json();step('P26','ops shows agency accounts and no alerts',o.agency&&Object.values(o.agency.accounts).reduce((a,b)=>a+b,0)>=2&&o.alerts.agencyPendingStale===0,JSON.stringify(o.agency));}
}catch(e){step('X','driver error',false,String(e?.stack||e).slice(0,600));await shot('error').catch(()=>{});}
await browser.close();
fs.writeFileSync(OUT+'/results.json',JSON.stringify(results,null,1));
console.log(`\n${results.filter(r=>r.ok).length}/${results.length} passed`);
