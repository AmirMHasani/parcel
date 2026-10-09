import {boundedJSON,respondError,workerAuth,HttpError,db} from '../../../lib/guard';
import {createJob,status} from '../../../lib/jobs';
import {requireSameOrigin} from '../../../lib/payment.mjs';
export async function POST(request:Request){try{requireSameOrigin(request);const health:any=await db().prepare("SELECT seen FROM worker_health WHERE id='runner'").first();if(process.env.BACKGROUND_EXPORTS!=='1'||!health||Date.now()-health.seen>180000){try{await workerAuth(request);}catch{throw new HttpError(503,'Background processing is not available yet. Your CSV has not been submitted. Please try again shortly.');}}const job=await createJob(request,await boundedJSON(request));return Response.json(await status(job),{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
