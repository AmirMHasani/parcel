import {workerAuth,respondError,boundedJSON} from '../../../../lib/guard';import {tick,cleanup} from '../../../../lib/job-worker';
// Runs background ticks. TICKS_PER_CALL=1 keeps each request inside Workers Free
// limits (10 ms CPU, 50 subrequests); 2 ticks run concurrently on paid plans.
// The scheduler sends {"clean":false} after its first call so cleanup runs once per minute.
export async function POST(request:Request){try{await workerAuth(request);let options:any={};try{options=await boundedJSON(request,1000);}catch{}const ticks=Math.min(2,Math.max(1,Number(options.ticks)||Number(process.env.TICKS_PER_CALL)||2));if(options.clean!==false)await cleanup();const results=await Promise.all(Array.from({length:ticks},()=>tick(false)));return Response.json({worked:results.some(r=>r.worked),type:results.filter(r=>r.worked).map(r=>r.type).join('+'),concurrency:ticks},{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
