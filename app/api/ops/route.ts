import {workerAuth,db,respondError,boundedJSON,HttpError} from '../../../lib/guard';

export async function GET(request:Request){try{
 await workerAuth(request);const now=Date.now();
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
 return Response.json({emails:emails.results,failedEmails:failedEmails.results,health:health.results,states:states.results,errors:errors.results,reviews:reviews.results,usage:usage.results,
  alerts:{stalled:attention?.stalled||0,refundReview:attention?.refundReview||0,delayedRefunds:attention?.delayedRefunds||0,billingReviews:attention?.billingReviews||0,checkoutReviews:attention?.checkoutReviews||0,failedEmails:failedEmails.results.length}
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
