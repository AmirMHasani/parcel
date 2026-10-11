// Fake Stripe + fake Resend for the local end-to-end run. Stateful: Checkout Sessions become "complete" when the
// browser visits the fake pay page, subscriptions can be changed through /_admin to simulate renewals, failures,
// cancellation and disputes. Nothing here talks to the real Stripe.
import http from 'node:http';
const state={sessions:new Map(),subs:new Map(),customers:new Map(),charges:[],emails:[],portals:0,n:0};
const id=p=>p+'_'+(++state.n).toString(36)+Math.random().toString(36).slice(2,8);
const now=()=>Math.floor(Date.now()/1000);
function form(body){return Object.fromEntries(new URLSearchParams(body));}
function json(res,code,obj){res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(obj));}
function sub(s){return {id:s.id,object:'subscription',status:s.status,customer:s.customer,cancel_at_period_end:s.cancel_at_period_end,current_period_start:s.period_start,current_period_end:s.period_end,items:{data:[{id:'si_1',current_period_start:s.period_start,current_period_end:s.period_end}]},metadata:s.metadata};}
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://x');let body='';for await(const c of req)body+=c;const p=url.pathname;
 try{
  if(req.method==='POST'&&p==='/v1/checkout/sessions'){const f=form(body);const s={id:id('cs'),status:'open',client_reference_id:f.client_reference_id,customer:f.customer||null,customer_email:f.customer_email||null,success_url:f.success_url.replace('https://parcelexport.com','http://127.0.0.1:8787'),cancel_url:f.cancel_url.replace('https://parcelexport.com','http://127.0.0.1:8787'),params:f,subscription:null};state.sessions.set(s.id,s);return json(res,200,{id:s.id,url:'http://127.0.0.1:4242/pay/'+s.id,status:'open'});}
  if(req.method==='GET'&&p.startsWith('/v1/checkout/sessions/')){const s=state.sessions.get(p.split('/')[4]);if(!s)return json(res,404,{error:{message:'no such session'}});return json(res,200,{id:s.id,status:s.status,client_reference_id:s.client_reference_id,subscription:s.subscription,customer:s.customer,customer_details:{email:s.customer_email||state.customers.get(s.customer)?.email||'buyer@example.test'},payment_status:s.status==='complete'?'paid':'unpaid'});}
  if(req.method==='POST'&&/^\/v1\/checkout\/sessions\/[^/]+\/expire$/.test(p)){const s=state.sessions.get(p.split('/')[4]);if(s)s.status='expired';return json(res,200,{status:'expired'});}
  if(req.method==='GET'&&p.startsWith('/v1/subscriptions/')){const s=state.subs.get(p.split('/')[3]);return s?json(res,200,sub(s)):json(res,404,{error:{message:'no such subscription'}});}
  if(req.method==='POST'&&p==='/v1/billing_portal/sessions'){state.portals++;const f=form(body);return json(res,200,{id:id('bps'),url:'http://127.0.0.1:4242/portal?customer='+f.customer+'&return='+encodeURIComponent(f.return_url),configuration:f.configuration||null});}
  if(req.method==='GET'&&p==='/v1/charges'){const c=url.searchParams.get('customer');return json(res,200,{object:'list',data:state.charges.filter(x=>x.customer===c)});}
  // --- the fake hosted pages ---
  if(p.startsWith('/pay/')){const s=state.sessions.get(p.slice(5));if(!s){res.writeHead(404);return res.end('no session');}
   if(url.searchParams.get('action')==='pay'){s.status='complete';const cust=s.customer||id('cus');if(!state.customers.has(cust))state.customers.set(cust,{email:s.customer_email||'buyer@example.test'});const sb={id:id('sub'),status:'active',customer:cust,cancel_at_period_end:false,period_start:now()-60,period_end:now()+30*86400,metadata:{agency_account:s.client_reference_id}};state.subs.set(sb.id,sb);s.subscription=sb.id;s.customer=cust;state.charges.push({id:id('ch'),customer:cust,disputed:false,amount:4900});res.writeHead(302,{location:s.success_url});return res.end();}
   if(url.searchParams.get('action')==='cancel'){res.writeHead(302,{location:s.cancel_url});return res.end();}
   res.writeHead(200,{'content-type':'text/html'});return res.end(`<!doctype html><title>Fake Stripe Checkout</title><h1>Fake Stripe Checkout</h1><p>Session ${s.id} · mode ${s.params.mode} · price ${s.params['line_items[0][price]']} · tax ${s.params['automatic_tax[enabled]']||'off'} · tos ${s.params['consent_collection[terms_of_service]']}</p><a id="pay" href="/pay/${s.id}?action=pay">Pay $49</a> <a id="cancel" href="/pay/${s.id}?action=cancel">Cancel</a>`);}
  if(p==='/portal'){res.writeHead(200,{'content-type':'text/html'});return res.end(`<!doctype html><title>Fake Customer Portal</title><h1>Fake Customer Portal</h1><p>customer ${url.searchParams.get('customer')}</p><a id="back" href="${url.searchParams.get('return')}">Return</a>`);}
  // --- admin for the test driver ---
  if(p==='/_admin/sub'&&req.method==='POST'){const b=JSON.parse(body);const s=[...state.subs.values()].filter(x=>x.metadata?.agency_account===b.account).at(-1)||[...state.subs.values()].at(-1);if(!s)return json(res,404,{});Object.assign(s,b.patch);return json(res,200,sub(s));}
  if(p==='/_admin/dispute'&&req.method==='POST'){const b=JSON.parse(body);for(const c of state.charges)if(c.customer===b.customer)c.disputed=true;return json(res,200,{ok:true});}
  if(p==='/_admin/state')return json(res,200,{sessions:[...state.sessions.values()],subs:[...state.subs.values()],emails:state.emails,portals:state.portals,charges:state.charges});
  // --- fake Resend ---
  if(p==='/emails'&&req.method==='POST'){const m=JSON.parse(body);state.emails.push(m);return json(res,200,{id:id('em')});}
  json(res,404,{error:{message:'unexpected '+req.method+' '+p}});
 }catch(e){json(res,500,{error:{message:String(e)}});}
}).listen(4242,'127.0.0.1',()=>console.log('fake stripe on 4242'));
