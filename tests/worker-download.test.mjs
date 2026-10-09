import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const workerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=workerRequire('miniflare');
const helper=fs.readFileSync(new URL('../lib/fixed-download.mjs',import.meta.url),'utf8').replace('export function','function');
test('Workers preserves exact HTTP length for full and ranged streamed downloads',async()=>{
 const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',script:helper+`
 export default {fetch(request){
  const partial=request.headers.has('range'),length=partial?17:100000;
  const actual=new URL(request.url).pathname==='/short'?length-1:length;
  let sent=0;
  const stream=new ReadableStream({pull(c){if(sent===actual){c.close();return;}const n=Math.min(8192,actual-sent);c.enqueue(new Uint8Array(n).fill(7));sent+=n;}},{highWaterMark:0});
  return new Response(fixedDownload(stream,length,()=>{}),{status:partial?206:200,headers:{'Content-Type':'application/zip','Content-Length':String(length),...(partial?{'Content-Range':'bytes 0-16/100000'}:{})}});
 }};`});
 try{for(const range of [null,'bytes=0-16']){
  const r=await mf.dispatchFetch('https://parcel.test/download',{headers:range?{Range:range}:{}});
  const expected=range?17:100000;assert.equal(r.status,range?206:200);assert.equal(r.headers.get('content-length'),String(expected));
  const bytes=new Uint8Array(await r.arrayBuffer());assert.equal(bytes.length,expected);assert(bytes.every(b=>b===7));
 }
 const short=await mf.dispatchFetch('https://parcel.test/short');await assert.rejects(short.arrayBuffer());
 }finally{await mf.dispose();}
});
