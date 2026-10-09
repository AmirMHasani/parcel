import {emailReady} from '../../../lib/notifications';
import {paymentsReady,stripeReady,paypalReady} from '../../../lib/launch';
import {db} from '../../../lib/guard';
export async function GET(){let background=false;try{const h:any=await db().prepare("SELECT seen FROM worker_health WHERE id='runner'").first();background=process.env.BACKGROUND_EXPORTS==='1'&&!!h&&Date.now()-h.seen<180000;}catch{}return Response.json({payments:paymentsReady()&&background,stripe:stripeReady()&&background,paypal:paypalReady()&&background,email:emailReady()&&background,background,limits:{dailyExports:5,activeExports:2,freeBytes:300000000,paidBytes:1000000000,retentionHours:24}},{headers:{'Cache-Control':'no-store'}});}
