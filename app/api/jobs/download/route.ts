import {fixedDownload} from '../../../../lib/fixed-download.mjs';
import {zipFileName,contentDisposition} from '../../../../lib/zip-name.mjs';
import {byteRange} from '../../../../lib/download-range.mjs';
import {downloadAccess} from '../../../../lib/capabilities';
import {rate,respondError,db,bucket,HttpError,consume,client,event} from '../../../../lib/guard';
export async function GET(request:Request){try{
 await rate(request,'download-zip',120);
 const {job,part}=await downloadAccess(new URL(request.url).searchParams.get('token')||'');
 if(part!==1)throw new HttpError(409,'Return to your results page to download the complete ZIP.');
 const result=await db().prepare('SELECT * FROM export_parts WHERE job_id=? ORDER BY part').bind(job.id).all();
 const segments=result.results as any[];
 if(!segments.length||segments.length!==job.parts)throw new HttpError(409,'Your ZIP is not ready. Return to the results page.');
 if(segments.length>1&&!await bucket().head('exports/'+job.id+'/zip-state/'+job.parts+'.json'))throw new HttpError(409,'Return to your results page to prepare this older export as one ZIP.');
 const bytes=segments.reduce((sum,p)=>sum+p.bytes,0);
 const etag='"'+job.id+'-'+job.ready_at+'-'+job.retry_count+'-'+bytes+'"';
 const requested=request.headers.get('if-range');
 const range=byteRange(!requested||requested===etag?request.headers.get('range'):null,bytes);
 const common={'Accept-Ranges':'bytes','ETag':etag,'Cache-Control':'private, no-store, no-transform','X-Content-Type-Options':'nosniff'};
 if(!range)return new Response(null,{status:416,headers:{...common,'Content-Range':'bytes */'+bytes}});
 const headers={...common,'Content-Type':'application/zip','Content-Length':String(range.end-range.start+1),'Content-Disposition':contentDisposition(zipFileName(job)),...(range.partial?{'Content-Range':`bytes ${range.start}-${range.end}/${bytes}`}:{})};
 if(request.method==='HEAD')return new Response(null,{status:range.partial?206:200,headers});
 const rangeEnd=range.end;
 const ip=await client(request);
 let position=range.start,cancelled=false,delivered=0;
 const transferId=crypto.randomUUID();
 const day=Math.floor(Date.now()/86400000)*86400000;
 const global='egress:global:'+day,personal='egress:'+ip+':'+day;
 let reserved=0;
 async function release(){const amount=reserved;reserved=0;if(amount)await db().batch([global,personal].map(id=>db().prepare('UPDATE usage_limits SET value=MAX(0,value-?) WHERE id=?').bind(amount,id)));}
 async function chunk(){
  let base=0,segment:any;
  for(const item of segments){if(position<base+item.bytes){segment=item;break;}base+=item.bytes;}
  if(!segment)throw new HttpError(503,'ZIP range is unavailable. Return to your results page and retry.');
  const length=Math.min(8388608,rangeEnd-position+1,base+segment.bytes-position);
  const object=await bucket().get(segment.object_key,{range:{offset:position-base,length}});
  if(!object)throw new HttpError(503,'A stored ZIP segment is unavailable. Return to your results page and retry.');
  const data=new Uint8Array(await object.arrayBuffer());
  if(data.length!==length)throw new HttpError(503,'Stored ZIP range is incomplete. Return to your results page and retry.');
  if(cancelled)return null;
  await consume(global,length,Number(process.env.GLOBAL_DAILY_EGRESS)||5000000000,day+86400000);
  try{await consume(personal,length,3000000000,day+86400000);}catch(e){await db().prepare('UPDATE usage_limits SET value=MAX(0,value-?) WHERE id=?').bind(length,global).run();throw e;}
  reserved=length;
  if(cancelled){await release();return null;}
  return data;
 }
 // Surface first-chunk storage/quota failures as an HTTP error before headers commit.
 // Keep only one bounded chunk buffered and refund reservations never enqueued.
 let first=await chunk();
 const stream=new ReadableStream<Uint8Array>({async pull(controller){try{
  if(cancelled)return;
  if(position>range.end){controller.close();return;}
  const data=first||await chunk();first=null;
  if(!data||cancelled)return;
  controller.enqueue(data);reserved=0;position+=data.length;delivered+=data.length;
 }catch(e){
  await release();
  await event('zip_stream_failed',JSON.stringify({transferId,start:range.start,end:range.end,delivered,status:e instanceof HttpError?e.status:500}),job.id);
  if(!cancelled)controller.error(e);
 }},async cancel(){cancelled=true;first=null;await release();}},{highWaterMark:0});
 const body=fixedDownload(stream,range.end-range.start+1,()=>event('zip_transport_failed',JSON.stringify({transferId,start:range.start,end:range.end,delivered}),job.id));
 return new Response(body,{status:range.partial?206:200,headers:{...headers,'X-Parcel-Transfer-Id':transferId}});
 }catch(e){return respondError(e);}}

export const HEAD=GET;
