// Agency plan — export entitlements (Phase 3). What an active agency account gets at export creation:
// no checkout (amount 0), the 1 GB size allowance, priority 1 in the worker queue, and one of the
// account's EXPORTS_PER_PERIOD slots for the current billing period, reserved atomically. Limits are per
// account (not per network address), so an agency on office Wi-Fi never shares limits with a free user.
import {db,consume,hash,HttpError} from './guard';
import {supportEmail} from './launch';
import {EXPORTS_PER_PERIOD,findAccount,validAgencyKey,AGENCY_KEY_HEADER,type AgencyAccount} from './agency';
import {refreshStatus} from './agency-billing';

export const AGENCY_DAILY_CREATIONS=20;        // new exports per account per day
export const AGENCY_ACTIVE_EXPORTS=4;          // waiting or processing at once, per account
export const AGENCY_DAILY_BYTES=5000000000;    // image download reservation per account per day (5 GB)
export const AGENCY_MAX_BYTES=1000000000;      // 1 GB per export, same as a paid one-time export
export const ACTIVE_STATES="('awaiting_payment','queued','downloading','packing')";

function resetDate(account:AgencyAccount){return account.period_end?new Date(account.period_end).toLocaleDateString('en-US',{month:'long',day:'numeric',timeZone:'UTC'}):'the next billing date';}
function support(){return supportEmail()||'support';}

// null when the request carries no agency key (ordinary export). Otherwise the account, or a specific error
// explaining why it cannot export right now. Period rollovers are refreshed from Stripe immediately.
export async function agencyForExport(request:Request):Promise<AgencyAccount|null>{
 if(!request.headers.get(AGENCY_KEY_HEADER))return null;
 let account=await refreshStatus(await findAccount(request));
 const now=Date.now();
 if(account.status==='active'&&account.period_end!=null&&account.period_end<=now&&account.stripe_subscription)account=await refreshStatus(account,true);
 if(account.suspended)throw new HttpError(403,'This agency account is suspended. Contact '+support()+'.');
 if(account.status==='past_due')throw new HttpError(402,'Your subscription payment did not go through. Update your card from your account page to keep exporting.');
 if(account.status==='pending')throw new HttpError(409,'Finish checkout to start agency exports.');
 if(account.status==='free')throw new HttpError(409,'Your Agency subscription has ended. Resubscribe from your account page, or run this export at the one-time price.');
 if(account.period_end!=null&&account.period_end<=now)throw new HttpError(409,'Your billing period has ended and the renewal has not been confirmed yet. Try again in a few minutes.');
 if(account.period_start==null)throw new HttpError(409,'Your billing period is not set up yet. Contact '+support()+'.');
 return account;
}

// Per-account creation limits; the active-export limit is also enforced inside the INSERT (see lib/jobs.ts).
export async function agencyCreationLimits(account:AgencyAccount){
 const now=Date.now(),day=Math.floor(now/86400000)*86400000;
 try{await consume('rate:agency-create:'+account.id+':'+day,1,AGENCY_DAILY_CREATIONS,day+86400000);}
 catch{throw new HttpError(429,'Agency accounts can start '+AGENCY_DAILY_CREATIONS+' exports per day. Try again tomorrow.',3600);}
 const active:any=await db().prepare(`SELECT COUNT(*) n FROM exports WHERE agency_id=? AND state IN ${ACTIVE_STATES} AND expires>?`).bind(account.id,now).first();
 if(active.n>=AGENCY_ACTIVE_EXPORTS)throw new HttpError(429,AGENCY_ACTIVE_EXPORTS+' agency exports are already active. Finish or cancel one first.',60);
}

// One slot of the current period, taken atomically: concurrent requests at 49 used let exactly one through.
export async function reserveUsageSlot(account:AgencyAccount){
 const period=account.period_start!;
 const row=await db().prepare('INSERT INTO usage_cycles(account_id,period_start,used) VALUES(?,?,1) ON CONFLICT(account_id,period_start) DO UPDATE SET used=used+1 WHERE used<? RETURNING used').bind(account.id,period,EXPORTS_PER_PERIOD).first<{used:number}>();
 if(!row)throw new HttpError(409,'You have used all '+EXPORTS_PER_PERIOD+' agency exports for this billing period. They reset on '+resetDate(account)+'. You can still run this export at the one-time price.');
 return {period,used:row.used,remaining:EXPORTS_PER_PERIOD-row.used};
}

export async function refundUsageSlot(accountId:string,period:number){
 await db().prepare('UPDATE usage_cycles SET used=MAX(0,used-1) WHERE account_id=? AND period_start=?').bind(accountId,period).run();
}

// Gives the slot back when an export ends without producing anything: cancelled before it started, or failed with
// zero images. The usage_slot flag makes this happen at most once per export, whatever path leads here.
export async function releaseUsageSlot(jobId:string){
 const row=await db().prepare('UPDATE exports SET usage_slot=0 WHERE id=? AND usage_slot=1 AND agency_id IS NOT NULL AND completed=0 AND usage_period IS NOT NULL RETURNING agency_id,usage_period').bind(jobId).first<{agency_id:string;usage_period:number}>();
 if(row)await refundUsageSlot(row.agency_id,row.usage_period);
 return !!row;
}

// An agency key opens any export that belongs to its account, in addition to the export's own recovery key.
export async function agencyOwnsJob(request:Request,job:any){
 if(!job?.agency_id)return false;
 const key=request.headers.get(AGENCY_KEY_HEADER);
 if(!validAgencyKey(key))return false;
 const account=await db().prepare('SELECT key_hash FROM agency_accounts WHERE id=?').bind(job.agency_id).first<{key_hash:string}>();
 return !!account&&await hash(key)===account.key_hash;
}
