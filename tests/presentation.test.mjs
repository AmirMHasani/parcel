import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportPresentation,observedETA} from '../lib/export-presentation.mjs';
import {notificationMessage} from '../lib/notification-message.mjs';
import {verifyDownload} from '../scripts/verify-download.mjs';
import {createHash} from 'node:crypto';
test('only ready exports show readiness; packing and failed exports keep distinct states',()=>{
 for(const state of ['queued','downloading','packing','failed','cancelled','expired'])assert.equal(exportPresentation({state,total:2,completed:2,failed:0}).ready,false);
 assert.equal(exportPresentation({state:'partial',total:2,completed:1,failed:1}).percent,100);
 assert.equal(exportPresentation({state:'packing',total:2,completed:2,failed:0}).title,'Building your ZIP');
 assert.equal(exportPresentation({state:'downloading',total:2,completed:1,failed:0}).title,'Saving your images');
});
test('time estimate uses observed progress and drops stale or cross-job estimates',()=>{
 const a={id:'a',state:'downloading',total:10,completed:2,failed:0},b={...a,completed:4};
 assert.equal(observedETA(a,b,10000),30);assert.equal(observedETA(a,a,10000),null);
 assert.equal(observedETA(a,{...b,id:'b'},10000),null);assert.equal(observedETA(a,{...b,state:'packing'},10000),null);
});
test('notification outcomes distinguish failure, partial and complete and never request payment twice',()=>{
 const job={state:'complete',completed:2,failed:0,amount:900,expires:Date.now()+10000};
 assert.match(notificationMessage(job,'https://parcel.test/results').text,/Payment is required/);
 const paid=notificationMessage({...job,payment_intent:'verified'},'https://parcel.test/results');assert.match(paid.text,/No additional payment/);assert.doesNotMatch(paid.text,/Payment is required/);
 const partial=notificationMessage({...job,state:'partial',failed:1},'https://parcel.test/results');assert.match(partial.subject,/partially/);assert.match(partial.text,/failed-downloads.csv/);
 const failure=notificationMessage({...job,state:'failed',completed:0},'https://parcel.test/results');assert.match(failure.subject,/needs attention/);assert.match(failure.text,/no downloadable ZIP/);assert.doesNotMatch(failure.text,/Payment is required|Your ZIP is ready/);
});
test('delivery verifier rejects HTML, HTTP errors, truncation and equal-size corruption',async()=>{
 const data=Buffer.from('test ZIP bytes'),expected={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
 const response=bytes=>new Response(bytes,{headers:{'Content-Type':'application/zip'}});
 assert.deepEqual(await verifyDownload(response(data),expected),expected);
 await assert.rejects(verifyDownload(new Response('login'),expected),/ZIP/);
 await assert.rejects(verifyDownload(new Response(null,{status:403}),expected),/403/);
 await assert.rejects(verifyDownload(response(data.subarray(1)),expected),/byte count/);
 await assert.rejects(verifyDownload(response(Buffer.alloc(data.length)),expected),/SHA-256/);
});
