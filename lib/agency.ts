// Agency subscription plan — accounts, keys and usage (Phase 1).
// An agency is identified by a private 64-hex key sent in the x-agency-key header. Only its
// SHA-256 hash is stored, exactly like export recovery keys. Billing (Stripe) arrives in Phase 2;
// export entitlements and the per-period cap arrive in Phase 3. Everything here is inert unless
// AGENCY_ENABLED=1 (lib/launch.ts).
import {db,hash,HttpError,rate} from './guard';
import {agencyEnabled} from './launch';

export const AGENCY_KEY_HEADER='x-agency-key';
export const EXPORTS_PER_PERIOD=50;
export const WARN_REMAINING=5;
// Failed key lookups allowed per client per day before 429 (keys are 256-bit, so this guards against hammering, not guessing).
export const KEY_FAILURES_PER_DAY=10;

export type AgencyStatus='pending'|'active'|'past_due'|'free';
export type AgencyAccount={id:string;key_hash:string;email:string|null;stripe_customer:string|null;stripe_subscription:string|null;stripe_session:string|null;status:AgencyStatus;period_start:number|null;period_end:number|null;status_checked_at:number|null;cancel_at_period_end:number;suspended:number;recovery_hash:string|null;recovery_expires:number|null;created:number;updated:number};

export function newAgencyKey(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
export function validAgencyKey(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
export function requireAgencyPlan(){if(!agencyEnabled())throw new HttpError(404,'The Agency plan is not available.');}

// Creates an account and returns its one-time key. Accounts start `pending` until Stripe confirms payment (Phase 2);
// an operator can create an `active` account by hand for testing (scripts/agency-admin.mjs).
export async function createAccount(fields:{email?:string|null;status?:AgencyStatus;periodStart?:number|null;periodEnd?:number|null}={}){
 const id=crypto.randomUUID(),key=newAgencyKey(),now=Date.now();
 await db().prepare('INSERT INTO agency_accounts(id,key_hash,email,status,period_start,period_end,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(id,await hash(key),fields.email||null,fields.status||'pending',fields.periodStart??null,fields.periodEnd??null,now,now).run();
 return {id,key};
}

// Resolves the key header to an account. A missing header is 401; an unknown key is 404 and counts
// toward KEY_FAILURES_PER_DAY, after which the client gets 429 for the rest of the day.
export async function findAccount(request:Request):Promise<AgencyAccount>{
 requireAgencyPlan();
 const key=request.headers.get(AGENCY_KEY_HEADER);
 if(!key)throw new HttpError(401,'Agency key required.');
 if(validAgencyKey(key)){const row=await db().prepare('SELECT * FROM agency_accounts WHERE key_hash=?').bind(await hash(key)).first<AgencyAccount>();if(row)return row;}
 await rate(request,'agency-key',KEY_FAILURES_PER_DAY,86400000);
 throw new HttpError(404,'Agency key not recognized.');
}

// Replaces the key. The old key stops working immediately; the update is conditional on the current hash so two
// concurrent rotations cannot both succeed.
export async function rotateKey(account:AgencyAccount){
 const key=newAgencyKey();
 const result=await db().prepare('UPDATE agency_accounts SET key_hash=?,updated=? WHERE id=? AND key_hash=?').bind(await hash(key),Date.now(),account.id,account.key_hash).run();
 if(!result.meta.changes)throw new HttpError(409,'The key was already rotated. Reload the page and try again.');
 return key;
}

export async function usedThisPeriod(account:AgencyAccount){
 if(account.period_start==null)return 0;
 const row=await db().prepare('SELECT used FROM usage_cycles WHERE account_id=? AND period_start=?').bind(account.id,account.period_start).first<{used:number}>();
 return row?.used||0;
}

// True when the account may start agency exports right now. Phase 3 enforces this at export creation.
export function canExport(account:AgencyAccount,now=Date.now()){return account.status==='active'&&!account.suspended&&(account.period_end==null||account.period_end>now);}

// Public shape returned to the browser. Never includes the key hash or Stripe ids.
export async function summary(account:AgencyAccount){
 const used=await usedThisPeriod(account),remaining=Math.max(0,EXPORTS_PER_PERIOD-used);
 return {id:account.id,status:account.suspended?'suspended':account.status,email:account.email,periodStart:account.period_start,periodEnd:account.period_end,cancelAtPeriodEnd:!!account.cancel_at_period_end,limit:EXPORTS_PER_PERIOD,used,remaining,warning:remaining<=WARN_REMAINING,canExport:canExport(account)};
}

export const RECOVERY_TTL_MS=3600000;
// Lost-key recovery, step 1: a one-hour token for the account whose billing email matches. The token is emailed; the
// current key keeps working until the token is used, so a stranger typing someone's email cannot lock them out.
// Returns null when no account matches (the caller answers the same either way).
export async function createRecovery(email:string){
 const account=await db().prepare("SELECT * FROM agency_accounts WHERE lower(email)=lower(?) AND status IN ('active','past_due','free') AND suspended=0 ORDER BY updated DESC LIMIT 1").bind(email).first<AgencyAccount>();
 if(!account)return null;
 const token=newAgencyKey(),now=Date.now();
 await db().prepare('UPDATE agency_accounts SET recovery_hash=?,recovery_expires=?,updated=? WHERE id=?').bind(await hash(token),now+RECOVERY_TTL_MS,now,account.id).run();
 return {account,token};
}
// Step 2: the emailed token rotates the key and is consumed. Expired or unknown tokens are a 404 with no detail.
export async function redeemRecovery(token:unknown){
 if(!validAgencyKey(token))throw new HttpError(404,'This recovery link is not valid.');
 const account=await db().prepare('SELECT * FROM agency_accounts WHERE recovery_hash=?').bind(await hash(token)).first<AgencyAccount>();
 if(!account||!account.recovery_expires||account.recovery_expires<Date.now())throw new HttpError(404,'This recovery link has expired. Request a new one.');
 const key=newAgencyKey();
 const r=await db().prepare('UPDATE agency_accounts SET key_hash=?,recovery_hash=NULL,recovery_expires=NULL,updated=? WHERE id=? AND recovery_hash=?').bind(await hash(key),Date.now(),account.id,account.recovery_hash).run();
 if(!r.meta.changes)throw new HttpError(404,'This recovery link was already used.');
 return {account,key};
}

// Exports that belong to the account in its current billing period (or the last 60 days without one), newest first.
export async function listExports(account:AgencyAccount,limit=60){
 const since=account.period_start??Date.now()-60*86400000;
 const rows=await db().prepare('SELECT id,state,total,completed,failed,bytes,created,ready_at,expires,client_name,priority,usage_slot FROM exports WHERE agency_id=? AND created>=? ORDER BY created DESC LIMIT ?').bind(account.id,since,limit).all<any>();
 return rows.results.map(r=>({id:r.id,state:r.expires<Date.now()&&r.state!=='expired'?'expired':r.state,total:r.total,completed:r.completed,failed:r.failed,bytes:r.bytes,created:r.created,readyAt:r.ready_at,expires:r.expires,clientName:r.client_name,countsTowardLimit:!!r.usage_slot}));
}
