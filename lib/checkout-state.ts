import {db,HttpError} from './guard';

// Persist the provider and exact request before any external side effect.
export async function claimCheckout(job:any,provider:string,payload:string){
 const current:any=await db().prepare(`UPDATE exports SET payment_provider=?,checkout_payload=?,checkout_started=?
 WHERE id=? AND session IS NULL AND checkout_started IS NULL RETURNING *`).bind(provider,payload,Date.now(),job.id).first();
 const saved=current||await db().prepare('SELECT * FROM exports WHERE id=?').bind(job.id).first();
 if(saved.payment_provider!==provider)throw new HttpError(409,'Continue the existing checkout. Another payment provider cannot be started for this export.');
 return saved;
}
export async function submitCheckout(job:any,send:(payload:string,key:string)=>Promise<any>){
 // Never reuse a creation key after the provider may have forgotten it.
 const windowMs=(job.payment_provider==='paypal'?5:23)*3600000;
 if(job.checkout_review||!job.checkout_payload||Date.now()-job.checkout_started>=windowMs){
  await db().prepare('UPDATE exports SET checkout_review=1 WHERE id=?').bind(job.id).run();
  throw new HttpError(409,'This payment attempt needs support review. Do not start another payment.');
 }
 const result=await send(job.checkout_payload,(job.payment_provider==='paypal'?'o-':'parcel-job-')+job.id);
 if(!result.id)throw new HttpError(503,'Payment provider did not return a checkout reference. Retry this checkout.');
 await db().prepare('UPDATE exports SET session=?,next_run=? WHERE id=? AND session IS NULL AND payment_provider=?').bind(result.id,Date.now(),job.id,job.payment_provider).run();
 return result;
}
export async function recordPayment(job:any,paymentId:string){
 // Decide availability at commit time: a capture can finish across expiry.
 const now=Date.now();
 if(typeof paymentId!=='string'||!paymentId)throw new HttpError(409,'Payment reference is missing.');
 await db().prepare(`UPDATE exports SET payment_intent=?,
 refund_state=CASE WHEN payment_intent IS NULL AND (expires<=? OR state IN ('expired','cancelled','failed')) THEN COALESCE(refund_state,'pending') ELSE refund_state END,
 state=CASE WHEN state='awaiting_payment' AND expires>? THEN 'queued' ELSE state END,
 next_run=?,last_error=NULL WHERE id=? AND (payment_intent IS NULL OR payment_intent=?)`).bind(paymentId,now,now,now,job.id,paymentId).run();
}
