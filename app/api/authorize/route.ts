import {boundedJSON,rate,respondError} from '../../../lib/guard';
import { checked } from '../../../lib/server';
import { createExportToken,requireSameOrigin } from '../../../lib/payment.mjs';
export async function POST(request:Request){try{requireSameOrigin(request);await rate(request,'authorize',10,86400000);const body:any=await boundedJSON(request);delete body.token;const job=await checked(body);if(job.amount)throw Error("Paid exports require a saved background job.");const token=await createExportToken(job.hash,process.env.EXPORT_SIGNING_SECRET);return Response.json({token,products:job.count,images:job.items.length,paid:job.amount>0},{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
