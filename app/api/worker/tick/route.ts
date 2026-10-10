import {workerAuth,respondError,boundedJSON} from '../../../../lib/guard';import {tick,cleanup} from '../../../../lib/job-worker';
// Runs background ticks. TICKS_PER_CALL=1 keeps each request inside Workers Free
// limits (10 ms CPU, 50 subrequests); 2 ticks run concurrently on paid plans.
// The scheduler sends {"clean":false} after its first call so cleanup runs once per minute.
//
// Response headers are sent immediately and the JSON result follows when the
// ticks finish. Cloudflare counts a call as an open connection only while it
// waits for response headers, and every tick started from one scheduler run
// (through the SELF service binding) shares that run's limit of six. Sending
// headers early keeps the scheduler's parallel lanes from holding those slots,
// so the ticks themselves can use them. Errors after this point are reported
// in the body as {"error":...,"status":...} with HTTP 200.
export async function POST(request:Request){try{await workerAuth(request);let options:any={};try{options=await boundedJSON(request,1000);}catch{}const ticks=Math.min(2,Math.max(1,Number(options.ticks)||Number(process.env.TICKS_PER_CALL)||2));
 const {readable,writable}=new TransformStream<Uint8Array,Uint8Array>();
 const finish=(async()=>{let payload:any;try{if(options.clean!==false)await cleanup();const results=await Promise.all(Array.from({length:ticks},()=>tick(false)));payload={worked:results.some(r=>r.worked),type:results.filter(r=>r.worked).map(r=>r.type).join('+'),concurrency:ticks};}catch(e){const failed=await respondError(e);const body:any=await failed.json();payload={...body,status:failed.status,worked:false};}
  const writer=writable.getWriter();try{await writer.write(new TextEncoder().encode(JSON.stringify(payload)));await writer.close();}catch{}})();
 finish.catch(()=>{});
 return new Response(readable,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}catch(e){return respondError(e);}}
