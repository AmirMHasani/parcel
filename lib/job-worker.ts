import {maintenance as agencyMaintenance} from './agency-billing';
import {releaseUsageSlot,AGENCY_DAILY_BYTES} from './agency-exports';
import {submitCheckout} from './checkout-state';
import {db,bucket,event,HttpError,reserveTransfer} from './guard';
import {download} from './downloader';
import {confirmPayment} from './jobs';
import {emailTick} from './notifications';
import {paypal,confirmPayPal} from './paypal';
import {stripe} from './server';
import {zipWriter,csv,crc32} from './export.mjs';
import {maxConcurrentJobs,maxConcurrentPacking,PRIORITY_SQL,PRIORITY_AGING_MS} from './capacity';
const VERSION='parcel-worker-v3-single-zip';
async function update(job:any,sql:string,args:any[]=[]){return db().prepare(sql+' WHERE id=? AND lease_owner=?').bind(...args,job.id,job.lease_owner).run();}
export async function tick(clean=true){const now=Date.now();if(clean)await cleanup();await db().prepare("INSERT INTO worker_health(id,seen,version) VALUES('runner',?,?) ON CONFLICT(id) DO UPDATE SET seen=excluded.seen,version=excluded.version").bind(now,VERSION).run();
 if(await emailTick())return {worked:true,type:'email'};
 const refund:any=await db().prepare("SELECT * FROM exports WHERE (refund_state IN ('pending','retry','submitted') OR (refund_state='refunded' AND created>?)) AND next_run<=? AND lease_until<? LIMIT 1").bind(now-7*86400000,now,now).first();
 if(refund){const lease=crypto.randomUUID();const claimed:any=await db().prepare('UPDATE exports SET lease_owner=?,lease_until=? WHERE id=? AND lease_until<? RETURNING *').bind(lease,now+120000,refund.id,now).first();if(claimed){try{const r=claimed.payment_provider==='paypal'?(claimed.refund_id?await paypal('/v2/payments/refunds/'+claimed.refund_id):await paypal('/v2/payments/captures/'+claimed.payment_intent+'/refund',{},'r-'+claimed.id)):claimed.refund_id?await stripe('refunds/'+claimed.refund_id):await stripe('refunds',new URLSearchParams({payment_intent:claimed.payment_intent,reason:'requested_by_customer'}),'parcel-refund-'+claimed.id);await update(claimed,'UPDATE exports SET refund_state=?,refund_id=?,next_run=?,lease_until=0,lease_owner=NULL',[['succeeded','COMPLETED'].includes(r.status)?'refunded':['failed','canceled','FAILED','CANCELLED'].includes(r.status)?'needs_review':'submitted',r.id,Date.now()+(['succeeded','COMPLETED'].includes(r.status)?1800000:300000)]);await event('refund_requested','Payment provider refund request accepted',claimed.id);}catch(e:any){await update(claimed,"UPDATE exports SET refund_state='retry',next_run=?,lease_until=0,lease_owner=NULL",[Date.now()+300000]);await event('refund_error',e.message,claimed.id);}return {worked:true,type:'refund'};}}
 // Payment reconciliation outlives file retention and never initiates an expired capture.
 const paymentLease=crypto.randomUUID();
 const payment:any=await db().prepare(`UPDATE exports SET lease_owner=?,lease_until=? WHERE id=(
 SELECT id FROM exports WHERE payment_intent IS NULL AND (session IS NOT NULL OR (checkout_started IS NOT NULL AND checkout_review=0))
 AND next_run<=? AND lease_until<? ORDER BY next_run,created LIMIT 1) AND lease_until<? RETURNING *`)
 .bind(paymentLease,now+120000,now,now,now).first();
 if(payment){try{
  if(!payment.session){const result=await submitCheckout(payment,(payload,key)=>payment.payment_provider==='paypal'
   ?paypal('/v2/checkout/orders',JSON.parse(payload),key):stripe('checkout/sessions',new URLSearchParams(payload),key));payment.session=result.id;}
  const paid=await confirmPayment(payment);
  if(!paid)await update(payment,'UPDATE exports SET next_run=?',[Date.now()+(payment.expires<=Date.now()?3600000:60000)]);
 }catch(e:any){await update(payment,'UPDATE exports SET next_run=?',[Date.now()+300000]);await event('payment_confirmation_error',e.message,payment.id);}
 finally{await update(payment,'UPDATE exports SET lease_until=0,lease_owner=NULL');}
 return {worked:true,type:'payment'};}
 // At most MAX_CONCURRENT_JOBS exports hold a lease (are being processed) at once
 // across the service, and at most MAX_CONCURRENT_PACKING of them build ZIPs.
 // Packing streams from storage, so it runs alongside image downloads instead of
 // pausing them. Turns rotate by next_run, so waiting exports are not starved.
 const lease=crypto.randomUUID();const job:any=await db().prepare("UPDATE exports SET lease_owner=?,lease_until=? WHERE id=(SELECT id FROM exports WHERE ((state IN ('queued','downloading','packing','awaiting_payment') AND (state!='awaiting_payment' OR session IS NOT NULL)) OR (state IN ('complete','partial') AND session IS NOT NULL AND payment_intent IS NULL)) AND next_run<=? AND lease_until<? AND expires>? AND (SELECT COUNT(*) FROM exports WHERE lease_until>?)<? AND (cursor<total OR state IN ('awaiting_payment','complete','partial') OR (SELECT COUNT(*) FROM exports WHERE lease_until>? AND cursor>=total AND state IN ('queued','downloading','packing'))<?) ORDER BY "+PRIORITY_SQL+" DESC,next_run,created LIMIT 1) AND lease_until<? RETURNING *").bind(lease,now+120000,now,now,now,now,maxConcurrentJobs(),now,maxConcurrentPacking(),now-PRIORITY_AGING_MS,now).first();if(!job)return {worked:false};
 try{if(job.state==='awaiting_payment'||['complete','partial'].includes(job.state)&&job.session){try{await confirmPayment(job);}catch(e:any){await event('payment_confirmation_error',e.message,job.id);}await update(job,'UPDATE exports SET next_run=?',[Date.now()+60000]);return {worked:true,type:'payment'};}
 const obj=await bucket().get(job.manifest);if(!obj)throw Error('Export metadata unavailable.');const manifest:any=await obj.json();
 if(job.cursor<job.total){await processImage(job,manifest);return {worked:true,type:'image',job:job.id};}
 if(job.completed===0){await update(job,"UPDATE exports SET state='failed',last_error='No images could be downloaded.',refund_state=CASE WHEN payment_intent IS NOT NULL THEN 'pending' ELSE NULL END,next_run=?",[Date.now()]);await update(job,'UPDATE exports SET ready_at=COALESCE(ready_at,?),expires=CASE WHEN ready_at IS NULL THEN ? ELSE expires END',[Date.now(),Date.now()+86400000]);await event('export_failed','No images downloaded',job.id);if(job.agency_id)await releaseUsageSlot(job.id);return {worked:true,type:'failed'};}
 await pack(job,manifest);return {worked:true,type:'pack',job:job.id};
 }catch(e:any){await event('worker_error',e.message,job.id);if(e instanceof HttpError&&e.status===429){await update(job,'UPDATE exports SET next_run=?,last_error=?',[Date.now()+Math.min(3600,e.retryAfter||60)*1000,'Waiting for the download budget to reset.']);}else if(job.attempts<2){await update(job,'UPDATE exports SET attempts=attempts+1,next_run=?,last_error=?',[Date.now()+30000,'Temporary processing failure. Retrying automatically.']);}else{await update(job,"UPDATE exports SET state='failed',ready_at=COALESCE(ready_at,?),expires=CASE WHEN ready_at IS NULL THEN ? ELSE expires END,last_error='Processing failed. Retry this export or request a review.',refund_state=CASE WHEN payment_intent IS NOT NULL AND completed=0 THEN 'pending' ELSE refund_state END,next_run=?",[Date.now(),Date.now()+86400000,Date.now()]);if(job.agency_id)await releaseUsageSlot(job.id);}}finally{await update(job,'UPDATE exports SET lease_until=0,lease_owner=NULL');}return {worked:true,type:'retry'};}
async function counters(job:any){return update(job,"UPDATE exports SET cursor=cursor+1,completed=(SELECT COUNT(*) FROM export_images WHERE job_id=? AND status='complete'),failed=(SELECT COUNT(*) FROM export_images WHERE job_id=? AND status='failed'),bytes=(SELECT COALESCE(SUM(bytes),0) FROM export_images WHERE job_id=? AND status='complete'),attempts=0,next_run=?,state='downloading'",[job.id,job.id,job.id,Date.now()]);}
async function processImage(job:any,manifest:any){const i=manifest.items[job.cursor],key='exports/'+job.id+'/images/'+job.cursor;const prior:any=await db().prepare('SELECT * FROM export_images WHERE id=?').bind(job.id+':'+job.cursor).first();if(prior?.status==='complete'){await counters(job);return;}
 let head=await bucket().head(key);if(!head){if(job.bytes+20000000>job.max_bytes&&job.bytes>=job.max_bytes)throw new HttpError(400,'Export exceeds its size allowance.');const release=await reserveTransfer(job.agency_id?'agency:'+job.agency_id:job.ip,20000000,job.agency_id?AGENCY_DAILY_BYTES:undefined);let downloaded=0;try{const image=await download(i.url);downloaded=image.bytes.length;if(job.bytes+downloaded>job.max_bytes)throw new HttpError(400,'Export exceeds its size allowance.');await bucket().put(key,image.bytes,{httpMetadata:{contentType:image.type},customMetadata:{extension:image.extension,crc32:String(image.crc)}});head=await bucket().head(key);}catch(e:any){if(e instanceof HttpError&&e.status===429)throw e;if((e.status===503||e.name==='TimeoutError'||e.name==='AbortError')&&job.attempts<2)throw e;await db().prepare('INSERT OR REPLACE INTO export_images(id,job_id,position,status,bytes,error) VALUES(?,?,?,?,?,?)').bind(job.id+':'+job.cursor,job.id,job.cursor,'failed',0,e.message.slice(0,200)).run();await counters(job);return;}finally{await release(downloaded);}}
 if(!head)throw Error('Downloaded image was not persisted.');const savedCrc=Number(head.customMetadata?.crc32);await db().prepare('INSERT OR REPLACE INTO export_images(id,job_id,position,object_key,status,bytes,crc,extension) VALUES(?,?,?,?,?,?,?,?)').bind(job.id+':'+job.cursor,job.id,job.cursor,key,'complete',head.size,Number.isInteger(savedCrc)&&head.customMetadata?.crc32!==''?savedCrc:null,head.customMetadata?.extension||null).run();await counters(job);}
// Each tick persists a bounded segment of ONE ZIP. Only the final segment has
// the central directory. Customers never see or download these internal segments.
// Image bytes stream from storage straight into the segment: they are never
// copied or re-checksummed in JavaScript (checksums are recorded at download),
// so a packing tick stays inside small per-request CPU budgets. The image cap
// bounds storage calls per tick (Workers Free allows 50 subrequests).
const PACK_MAX_IMAGES=25,PACK_MAX_BYTES=20000000;
type Piece=Uint8Array|{length:number,key:string};
async function pack(job:any,manifest:any){
 const previous=job.parts?await bucket().get('exports/'+job.id+'/zip-state/'+job.parts+'.json'):null;
 if(job.parts&&!previous){await db().prepare('DELETE FROM export_parts WHERE job_id=?').bind(job.id).run();await update(job,"UPDATE exports SET pack_cursor=0,parts=0,state='packing',next_run=?",[Date.now()]);return;}
 const state:any=previous?await previous.json():{};
 const results=await db().prepare("SELECT * FROM export_images WHERE job_id=? AND position>=? AND status='complete' ORDER BY position LIMIT ?").bind(job.id,job.pack_cursor,PACK_MAX_IMAGES).all();
 const selected:any[]=[];let total=0;
 for(const item of results.results as any[]){if(selected.length&&total+item.bytes>PACK_MAX_BYTES)break;selected.push(item);total+=item.bytes;}
 if(!selected.length)throw Error('No saved images available for packing.');
 // Plan the segment first: headers and small files are bytes, images are placeholders streamed later.
 const pieces:Piece[]=[];let bytes=0;
 const zip=zipWriter(async(b:Piece)=>{pieces.push(b);bytes+=b.length;},state);
 const rows=state.rows||[['product_title','handle','sku','image_position','original_url','filename','alt_text']];
 for(const item of selected){
  const image=manifest.items[item.position];
  let crc=item.crc,extension=item.extension,body:Piece={length:item.bytes,key:item.object_key};
  if(crc===null||crc===undefined||!extension){// Saved before checksums were recorded: read it once.
   const object=await bucket().get(item.object_key);if(!object)throw Error('An image is missing from storage.');
   const data=new Uint8Array(await object.arrayBuffer());crc=crc32(data);extension=extension||object.customMetadata?.extension||'jpg';body=data;
  }
  const path=image.filename.replace(/\.image$/,'.'+extension);
  await zip.addStored(path,crc,item.bytes,body);
  if(manifest.options.manifest)rows.push([image.title,image.handle,image.sku,image.position||image.index,image.url,path,image.alt]);
 }
 const last=selected[selected.length-1].position;
 const remaining:any=await db().prepare("SELECT COUNT(*) n FROM export_images WHERE job_id=? AND status='complete' AND position>?").bind(job.id,last).first();
 if(!remaining.n){if(manifest.options.manifest)await zip.add('manifest.csv',new TextEncoder().encode(csv(rows)));if(job.failed){const failures=await db().prepare("SELECT position,error FROM export_images WHERE job_id=? AND status='failed'").bind(job.id).all();await zip.add('failed-downloads.csv',new TextEncoder().encode(csv([['handle','original_url','error'],...failures.results.map((x:any)=>[manifest.items[x.position].handle,manifest.items[x.position].url,x.error])])));}await zip.close();}
 const part=job.parts+1,key='exports/'+job.id+'/parts/'+part+'.zip';
 await writeSegment(key,pieces,bytes);
 await bucket().put('exports/'+job.id+'/zip-state/'+part+'.json',JSON.stringify({...zip.snapshot(),rows}),{httpMetadata:{contentType:'application/json'}});
 await db().prepare('INSERT OR REPLACE INTO export_parts(id,job_id,part,object_key,bytes,images) VALUES(?,?,?,?,?,?)').bind(job.id+':'+part,job.id,part,key,bytes,selected.length).run();
 await update(job,"UPDATE exports SET pack_cursor=?,parts=?,attempts=0,next_run=?,state=?,ready_at=CASE WHEN ?=0 THEN COALESCE(ready_at,?) ELSE ready_at END,expires=CASE WHEN ?=0 AND ready_at IS NULL THEN ? ELSE expires END",[last+1,part,Date.now(),remaining.n?'packing':job.failed?'partial':'complete',remaining.n,Date.now(),remaining.n,Date.now()+86400000]);
}
// Storage needs a known length: Workers use FixedLengthStream; Node tests use an
// identity stream that enforces the same exact length.
function lengthStream(total:number):{readable:ReadableStream,writable:WritableStream}{
 if(typeof FixedLengthStream!=='undefined')return new FixedLengthStream(total);
 let seen=0;return new TransformStream({transform(chunk:Uint8Array,controller){seen+=chunk.byteLength;if(seen>total)throw Error('ZIP segment is longer than planned.');controller.enqueue(chunk);},flush(){if(seen!==total)throw Error('ZIP segment length mismatch.');}});
}
// Streams the planned pieces into one stored object of exactly `total` bytes.
async function writeSegment(key:string,pieces:Piece[],total:number){
 const {readable,writable}=lengthStream(total);
 const upload=bucket().put(key,readable,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{format:'zip-segment-v1'}});
 const fill=(async()=>{try{
  for(const piece of pieces){
   if(piece instanceof Uint8Array){const writer=writable.getWriter();await writer.write(piece);writer.releaseLock();continue;}
   const object=await bucket().get(piece.key);if(!object)throw Error('An image is missing from storage.');
   if(object.size!==piece.length)throw Error('A saved image changed size.');
   await object.body.pipeTo(writable,{preventClose:true});
  }
  await writable.close();
 }catch(e){await writable.abort(e).catch(()=>{});throw e;}})();
 const [filled,stored]=await Promise.allSettled([fill,upload]);
 if(filled.status==='rejected')throw filled.reason;
 if(stored.status==='rejected')throw stored.reason;
}
export async function cleanup(){const now=Date.now();try{await agencyMaintenance(now);}catch(e:any){await event('agency_maintenance_error',e?.message||'Agency maintenance failed');}await db().prepare("UPDATE email_outbox SET payload=NULL,message=NULL WHERE state='failed' AND job_id IN (SELECT id FROM exports WHERE expires<?)").bind(now).run();await db().prepare("DELETE FROM email_outbox WHERE job_id IN (SELECT id FROM exports WHERE expires<?) AND (state!='failed' OR job_id IN (SELECT id FROM exports WHERE email_reviewed_at IS NOT NULL))").bind(now).run();const expired:any=await db().prepare("SELECT * FROM exports WHERE expires<? AND state!='expired' AND lease_until<? LIMIT 1").bind(now,now).first();if(expired){if(expired.payment_intent&&expired.completed===0&&!expired.refund_state){await db().prepare("UPDATE exports SET refund_state='pending',next_run=? WHERE id=?").bind(now,expired.id).run();}const objects=await bucket().list({prefix:'exports/'+expired.id+'/',limit:100});if(objects.objects.length)await bucket().delete(objects.objects.map(o=>o.key));else{await db().batch([db().prepare("UPDATE exports SET state='expired' WHERE id=?").bind(expired.id),db().prepare('DELETE FROM export_images WHERE job_id=?').bind(expired.id),db().prepare('DELETE FROM export_parts WHERE job_id=?').bind(expired.id)]);}return;}
 await db().batch([db().prepare('DELETE FROM usage_limits WHERE expires<?').bind(now),db().prepare('DELETE FROM error_events WHERE created<?').bind(now-7*86400000)]);}
