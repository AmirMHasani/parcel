import {workerAuth,db,respondError,boundedJSON,HttpError} from '../../../lib/guard';
import {agencyEnabled} from '../../../lib/launch';
import {PENDING_RECOVERY_MS} from '../../../lib/agency-billing';

// Agency plan health for the operator. Counts are informational; `alerts` fail the scheduled run like the others.
// Wrapped so a database that has not received migration 0005 yet cannot break the whole ops response.
export const AGENCY_PENDING_ALERT_MS=10*60000;   // a paid checkout still pending this long needs a look
export const AGENCY_ERROR_ALERT_COUNT=3;         // agency_* errors in the last 24 h before alerting
export async function agencyOps(now:number){
 try{
  const [accounts,exportsThisPeriod,codes,pendingStale,errors]=await Promise.all([
   db().prepare("SELECT status,SUM(CASE WHEN suspended=1 THEN 1 ELSE 0 END) suspended,COUNT(*) accounts FROM agency_accounts GROUP BY status").all<any>(),
   db().prepare('SELECT COALESCE(SUM(u.used),0) used,COUNT(*) accounts FROM usage_cycles u JOIN agency_accounts a ON a.id=u.account_id AND a.period_start=u.period_start').first<any>(),
   db().prepare('SELECT SUM(CASE WHEN account_id IS NULL THEN 1 ELSE 0 END) unused,SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) used FROM invite_codes').first<any>(),
   db().prepare("SELECT COUNT(*) n FROM agency_accounts WHERE status='pending' AND stripe_session IS NOT NULL AND updated<?").bind(now-Math.max(AGENCY_PENDING_ALERT_MS,PENDING_RECOVERY_MS)).first<any>(),
   db().prepare("SELECT COUNT(*) n FROM error_events WHERE code IN ('agency_sweep_error','agency_activation_error','agency_maintenance_error') AND created>?").bind(now-86400000).first<any>(),
  ]);
  const byStatus:Record<string,number>={};let suspended=0;for(const r of accounts.results){byStatus[r.status]=r.accounts;suspended+=r.suspended||0;}
  return {enabled:agencyEnabled(),accounts:byStatus,suspended,exportsThisPeriod:exportsThisPeriod?.used||0,accountsWithUsage:exportsThisPeriod?.accounts||0,inviteCodes:{unused:codes?.unused||0,used:codes?.used||0},
   alerts:{agencyPendingStale:pendingStale?.n||0,agencyErrors:(errors?.n||0)>=AGENCY_ERROR_ALERT_COUNT?errors.n:0}};
 }catch(e:any){return {enabled:agencyEnabled(),unavailable:e?.message||'agency tables unavailable',alerts:{agencyPendingStale:0,agencyErrors:0}};}
}

export async function GET(request:Request){try{
 await workerAuth(request);const now=Date.now();
 const agency=await agencyOps(now);
 const [health,states,errors,reviews,usage,attention,emails,failedEmails]=await Promise.all([
  db().prepare('SELECT * FROM worker_health').all(),
  db().prepare('SELECT state,COUNT(*) jobs FROM exports GROUP BY state').all(),
  db().prepare('SELECT id,job_id,code,detail,created FROM error_events ORDER BY created DESC LIMIT 50').all(),
  db().prepare('SELECT id,state,review_id,review_resolved_at,refund_state,checkout_review,last_error FROM exports WHERE review_id IS NOT NULL OR refund_state IS NOT NULL OR checkout_review=1 ORDER BY created DESC LIMIT 50').all(),
  db().prepare("SELECT id,value,expires FROM usage_limits WHERE id LIKE 'bytes:global:%' OR id LIKE 'egress:global:%'").all(),
  db().prepare(`SELECT
   SUM(CASE WHEN state IN ('queued','downloading','packing') AND next_run<? AND expires>? AND lease_until<? THEN 1 ELSE 0 END) stalled,
   SUM(CASE WHEN refund_state='needs_review' THEN 1 ELSE 0 END) refundReview,
   SUM(CASE WHEN refund_state IN ('pending','retry','submitted') AND created<? THEN 1 ELSE 0 END) delayedRefunds,
   SUM(CASE WHEN review_id IS NOT NULL AND review_resolved_at IS NULL THEN 1 ELSE 0 END) billingReviews,
   SUM(CASE WHEN checkout_review=1 AND payment_intent IS NULL THEN 1 ELSE 0 END) checkoutReviews
   FROM exports`).bind(now-300000,now,now,now-1800000).first(),
  db().prepare('SELECT state,COUNT(*) notifications FROM email_outbox GROUP BY state').all(),
  db().prepare("SELECT o.job_id FROM email_outbox o JOIN exports j ON j.id=o.job_id WHERE o.state='failed' AND j.email_reviewed_at IS NULL").all()
 ]);
 return Response.json({emails:emails.results,failedEmails:failedEmails.results,health:health.results,states:states.results,errors:errors.results,reviews:reviews.results,usage:usage.results,agency,
  alerts:{stalled:attention?.stalled||0,refundReview:attention?.refundReview||0,delayedRefunds:attention?.delayedRefunds||0,billingReviews:attention?.billingReviews||0,checkoutReviews:attention?.checkoutReviews||0,failedEmails:failedEmails.results.length,...agency.alerts}
 },{headers:{'Cache-Control':'no-store'}});
}catch(e){return respondError(e);}}

// Operator-only acknowledgement after handling the case; never changes payment access.
export async function POST(request:Request){try{
 await workerAuth(request);const body=await boundedJSON(request,2000);
 if(typeof body.id!=='string'||!['billing','email'].includes(body.kind))throw new HttpError(400,'Provide an export ID and billing or email review kind.');
 const result=body.kind==='billing'
  ?await db().prepare('UPDATE exports SET review_resolved_at=? WHERE id=? AND review_id IS NOT NULL AND review_resolved_at IS NULL').bind(Date.now(),body.id).run()
  :await db().prepare("UPDATE exports SET email_reviewed_at=? WHERE id=? AND email_reviewed_at IS NULL AND EXISTS(SELECT 1 FROM email_outbox WHERE job_id=exports.id AND state='failed')").bind(Date.now(),body.id).run();
 if(!result.meta.changes)throw new HttpError(409,'No unresolved case of that kind was found.');
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch(e){return respondError(e);}}
