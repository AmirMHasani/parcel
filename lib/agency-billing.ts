// Agency subscription billing (Phase 2) — Stripe Checkout in subscription mode, activation, status
// refresh, Customer Portal, resubscribe and the worker-side maintenance that recovers stranded
// checkouts and sweeps statuses. Rules that matter:
//  - The account and its key exist BEFORE Stripe is called, so a lost browser cannot strand a payment.
//  - A browser redirect never proves payment; activation always reads the session from Stripe.
//  - Status is cached for STATUS_CACHE_MS; if Stripe is unreachable a recent `active` is trusted for
//    STALE_OK_MS, after which exports fail closed with a clear message.
//  - No webhook endpoint in the beta (see agency-after-phase-6.md, row 8).
import {db,HttpError,event} from './guard';
import {stripe} from './server';
import {siteOrigin} from './seo';
import {agencyEnabled} from './launch';
import {createAccount,requireAgencyPlan,type AgencyAccount,type AgencyStatus} from './agency';

export const STATUS_CACHE_MS=10*60000;          // trust a status check this recent
export const STALE_OK_MS=24*3600000;            // ... and this long if Stripe is down
export const PENDING_RECOVERY_MS=120000;        // worker finishes activation after this
export const ABANDONED_CHECKOUT_MS=3600000;     // pending with no Stripe session → released
export const SWEEP_INTERVAL_MS=24*3600000;      // every account re-checked at least daily
export const CODE_PATTERN=/^[A-Z0-9-]{6,40}$/;

export function priceId(){return process.env.STRIPE_AGENCY_PRICE_ID||'';}
// Stripe Tax (automatic calculation) — only when Stripe Tax is active on the account; otherwise Checkout creation fails.
export function taxEnabled(){return process.env.STRIPE_TAX==='1';}
// Optional explicit Customer Portal configuration; the account's default is used when unset.
export function portalConfiguration(){return process.env.STRIPE_PORTAL_CONFIG_ID||'';}
export function billingReady(){return agencyEnabled()&&!!process.env.STRIPE_SECRET_KEY&&/^price_[A-Za-z0-9]+$/.test(priceId());}
export function requireBilling(){requireAgencyPlan();if(!billingReady())throw new HttpError(503,'Agency subscriptions are not available right now. Email support if you were invited.');}
export function normalizeCode(value:unknown){return typeof value==='string'?value.trim().toUpperCase():'';}
function validEmail(value:unknown):value is string{return typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
const account_=async(id:string)=>(await db().prepare('SELECT * FROM agency_accounts WHERE id=?').bind(id).first<AgencyAccount>())!;

// Stripe → Parcel status. Stripe keeps `active` with cancel_at_period_end=true until the period ends, then `canceled`.
export function mapSubscription(sub:any){
 const map:Record<string,AgencyStatus>={active:'active',trialing:'active',past_due:'past_due'};
 const item=sub?.items?.data?.[0];
 const start=sub?.current_period_start??item?.current_period_start,end=sub?.current_period_end??item?.current_period_end;
 // A scheduled cancellation is cancel_at_period_end=true (classic billing mode) or a cancel_at timestamp with the flag
 // false (flexible billing mode, the default for new accounts; the Customer Portal sets cancel_at directly there).
 const cancelAt=Number.isFinite(sub?.cancel_at)?sub.cancel_at*1000:null;
 const scheduled=!!sub?.cancel_at_period_end||(cancelAt!==null&&(!Number.isFinite(end)||cancelAt<=end*1000+86400000));
 return {status:map[sub?.status]||'free',periodStart:Number.isFinite(start)?start*1000:null,periodEnd:Number.isFinite(end)?end*1000:null,cancelAtPeriodEnd:scheduled?1:0,customer:typeof sub?.customer==='string'?sub.customer:sub?.customer?.id||null};
}

async function createSession(account:{id:string},fields:{email?:string|null;customer?:string|null},idempotency:string){
 const origin=siteOrigin();
 const params=new URLSearchParams({mode:'subscription','line_items[0][price]':priceId(),'line_items[0][quantity]':'1',client_reference_id:account.id,'metadata[agency_account]':account.id,'subscription_data[metadata][agency_account]':account.id,success_url:origin+'/agency/account?checkout=complete',cancel_url:origin+'/agency?checkout=cancelled',billing_address_collection:'required','consent_collection[terms_of_service]':'required'});
 if(fields.customer)params.set('customer',fields.customer);else if(fields.email)params.set('customer_email',fields.email);
 if(taxEnabled()){params.set('automatic_tax[enabled]','true');if(fields.customer)params.set('customer_update[address]','auto');}
 const session=await stripe('checkout/sessions',params,idempotency);
 if(!session?.id||!session?.url)throw new HttpError(503,'Payment provider did not return a checkout link. Please try again.');
 await db().prepare("UPDATE agency_accounts SET stripe_session=?,status='pending',updated=? WHERE id=?").bind(session.id,Date.now(),account.id).run();
 return session.url as string;
}

// Invite code → pending account + key → Stripe Checkout URL. The code is reserved atomically so it cannot be used twice,
// and released again if the checkout is abandoned (see maintenance()).
export async function startCheckout(body:any){
 requireBilling();
 const code=normalizeCode(body?.code);if(!CODE_PATTERN.test(code))throw new HttpError(400,'Enter your invite code.');
 const email=body?.email===undefined||body?.email===''?null:body.email;if(email!==null&&!validEmail(email))throw new HttpError(400,'Enter a valid email address or leave it blank.');
 const created=await createAccount({email});
 const reserved=await db().prepare('UPDATE invite_codes SET account_id=? WHERE code=? AND account_id IS NULL').bind(created.id,code).run();
 if(!reserved.meta.changes){await db().prepare('DELETE FROM agency_accounts WHERE id=?').bind(created.id).run();throw new HttpError(404,'That invite code is not valid or has already been used.');}
 try{const url=await createSession(created,{email},'agency-checkout-'+created.id);return {key:created.key,accountId:created.id,url};}
 catch(e){await release(created.id);throw e;}
}

// Returning customer (status free, not suspended): a new Checkout on the same Stripe customer; no code needed.
export async function resubscribe(account:AgencyAccount){
 requireBilling();
 if(account.suspended)throw new HttpError(403,'This account is suspended. Contact support.');
 if(account.status!=='free')throw new HttpError(409,'This account already has a subscription.');
 return createSession(account,{customer:account.stripe_customer,email:account.email},'agency-resub-'+account.id+'-'+Math.floor(Date.now()/3600000));
}

// Reads the Checkout Session from Stripe and, if it completed, activates the account. Safe to call repeatedly.
export async function activate(account:AgencyAccount):Promise<AgencyAccount>{
 if(account.status!=='pending'||!account.stripe_session)return account;
 const session=await stripe('checkout/sessions/'+account.stripe_session);
 if(session.client_reference_id&&session.client_reference_id!==account.id)throw new HttpError(409,'Checkout does not belong to this account.');
 if(session.status==='expired'){await abandon(account);throw new HttpError(410,'That checkout expired. Start again with your invite code.');}
 if(session.status!=='complete'||!session.subscription)return account;
 const subId=typeof session.subscription==='string'?session.subscription:session.subscription.id;
 const sub=await stripe('subscriptions/'+subId),m=mapSubscription(sub),now=Date.now();
 const email=session.customer_details?.email||null,customer=typeof session.customer==='string'?session.customer:m.customer;
 await db().batch([
  db().prepare("UPDATE agency_accounts SET status=?,stripe_customer=?,stripe_subscription=?,email=COALESCE(?,email),period_start=?,period_end=?,cancel_at_period_end=?,status_checked_at=?,updated=? WHERE id=? AND status='pending'").bind(m.status,customer,subId,email,m.periodStart,m.periodEnd,m.cancelAtPeriodEnd,now,now,account.id),
  db().prepare('UPDATE invite_codes SET used_at=? WHERE account_id=? AND used_at IS NULL').bind(now,account.id),
 ]);
 await event('agency_activated','Agency subscription activated',undefined);
 return account_(account.id);
}

// Current status from Stripe, cached. `force` ignores the cache (daily sweep). Throws 503 only when Stripe is
// unreachable AND the cached status is too old to trust.
export async function refreshStatus(account:AgencyAccount,force=false):Promise<AgencyAccount>{
 if(account.status==='pending')return activate(account);
 if(!account.stripe_subscription)return account;
 const now=Date.now(),age=account.status_checked_at?now-account.status_checked_at:Infinity;
 if(!force&&age<STATUS_CACHE_MS)return account;
 let sub:any;
 try{sub=await stripe('subscriptions/'+account.stripe_subscription);}
 catch{if(account.status==='active'&&age<STALE_OK_MS)return account;throw new HttpError(503,'We could not confirm your subscription right now. Please try again in a few minutes.');}
 const m=mapSubscription(sub);
 await db().prepare('UPDATE agency_accounts SET status=?,period_start=COALESCE(?,period_start),period_end=COALESCE(?,period_end),cancel_at_period_end=?,stripe_customer=COALESCE(?,stripe_customer),status_checked_at=?,updated=? WHERE id=?').bind(m.status,m.periodStart,m.periodEnd,m.cancelAtPeriodEnd,m.customer,now,now,account.id).run();
 return account_(account.id);
}

// Stripe-hosted page to change the card or cancel at period end. Requires a Customer Portal configuration in the dashboard.
export async function portalUrl(account:AgencyAccount){
 requireBilling();
 if(!account.stripe_customer)throw new HttpError(409,'Billing is not set up for this account yet.');
 const params=new URLSearchParams({customer:account.stripe_customer,return_url:siteOrigin()+'/agency/account'});if(portalConfiguration())params.set('configuration',portalConfiguration());
 const session=await stripe('billing_portal/sessions',params);
 if(!session?.url)throw new HttpError(503,'Payment provider did not return a billing page. Please try again.');
 return session.url as string;
}

// A chargeback on any charge for this customer suspends the account (beta policy; reinstatement is manual).
export async function checkDisputes(account:AgencyAccount){
 if(!account.stripe_customer||account.suspended)return false;
 const charges=await stripe('charges?customer='+encodeURIComponent(account.stripe_customer)+'&limit=10');
 const disputed=Array.isArray(charges?.data)&&charges.data.some((c:any)=>c.disputed===true);
 if(disputed){await db().prepare('UPDATE agency_accounts SET suspended=1,updated=? WHERE id=?').bind(Date.now(),account.id).run();await event('agency_suspended','Agency account suspended after a payment dispute');}
 return disputed;
}

async function release(accountId:string){await db().batch([db().prepare('UPDATE invite_codes SET account_id=NULL WHERE account_id=? AND used_at IS NULL').bind(accountId),db().prepare("DELETE FROM agency_accounts WHERE id=? AND status='pending' AND stripe_customer IS NULL").bind(accountId)]);}
// A checkout that never completed. New accounts disappear and their code is freed; returning customers go back to `free`.
async function abandon(account:AgencyAccount){if(account.stripe_customer)await db().prepare("UPDATE agency_accounts SET status='free',stripe_session=NULL,updated=? WHERE id=? AND status='pending'").bind(Date.now(),account.id).run();else await release(account.id);}

// Called from the worker's once-a-minute cleanup. Bounded work per call so a tick never runs long.
export async function maintenance(now=Date.now()){
 if(!agencyEnabled()||!process.env.STRIPE_SECRET_KEY)return;
 const pending=await db().prepare("SELECT * FROM agency_accounts WHERE status='pending' AND stripe_session IS NOT NULL AND updated<? LIMIT 3").bind(now-PENDING_RECOVERY_MS).all<AgencyAccount>();
 for(const account of pending.results){try{await activate(account);}catch(e:any){if(!(e instanceof HttpError&&e.status===410))await event('agency_activation_error',e?.message||'Activation failed');}}
 const stale=await db().prepare("SELECT * FROM agency_accounts WHERE status='pending' AND stripe_session IS NULL AND updated<?").bind(now-ABANDONED_CHECKOUT_MS).all<AgencyAccount>();
 for(const account of stale.results)await abandon(account);
 const due=await db().prepare("SELECT * FROM agency_accounts WHERE status IN ('active','past_due') AND (status_checked_at IS NULL OR status_checked_at<?) LIMIT 1").bind(now-SWEEP_INTERVAL_MS).first<AgencyAccount>();
 if(due){try{const fresh=await refreshStatus(due,true);await checkDisputes(fresh);}catch(e:any){await db().prepare('UPDATE agency_accounts SET status_checked_at=? WHERE id=?').bind(now-SWEEP_INTERVAL_MS+3600000,due.id).run();await event('agency_sweep_error',e?.message||'Status sweep failed');}}
}
