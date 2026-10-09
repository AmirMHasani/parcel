import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readJSON,recoveryAccess,resultsPath} from '../lib/client-api.mjs';
test('HTML authentication and gateway responses produce actionable errors instead of JSON exceptions',async()=>{
 await assert.rejects(readJSON(new Response('<!DOCTYPE html><html>Login</html>',{status:403,headers:{'content-type':'text/html'}})),e=>e.session&&/session/.test(e.message)&&!e.message.includes('Unexpected token'));
 await assert.rejects(readJSON(new Response('<!DOCTYPE html>',{status:502,headers:{'content-type':'text/html'}})),/saved job is preserved/);
 await assert.rejects(readJSON(new Response('{',{headers:{'content-type':'application/json'}})),/incomplete response/);
 assert.deepEqual(await readJSON(Response.json({id:'saved'})),{id:'saved'});
});
test('return links recover the exact job in fresh browsers and across multiple saved jobs',()=>{
 const a={id:'job-a',key:'secret-a'},b={id:'job-b',key:'secret-b'};
 assert.deepEqual(recoveryAccess('https://parcel.test'+resultsPath(a),()=>null),a);
 assert.deepEqual(recoveryAccess('https://parcel.test/results#export=job-a&key=secret-a',()=>null),a);
 const saved={'parcel-job':JSON.stringify(b),'parcel-job:job-a':JSON.stringify(a)};
 assert.deepEqual(recoveryAccess('https://parcel.test/results?export=job-a&session_id=cs',k=>saved[k]),a);
 assert.equal(recoveryAccess('https://parcel.test/results?export=job-c',k=>saved[k]),null);
 assert.deepEqual(recoveryAccess('https://parcel.test/results',k=>saved[k]),b);
});
test('explicit capability works even when browser storage is unavailable',()=>{assert.deepEqual(recoveryAccess('https://parcel.test/results?export=job-a#key=secret',()=>{throw Error('Storage blocked');}),{id:'job-a',key:'secret'});});

test('configuration retry updates every subscriber and coalesces concurrent refreshes',async()=>{
 const {refreshConfig,subscribeConfig}=await import('../lib/client-api.mjs');
 const oldFetch=globalThis.fetch;const parent=[],child=[];let calls=0;
 const offParent=subscribeConfig(v=>parent.push(v)),offChild=subscribeConfig(v=>child.push(v));
 try{globalThis.fetch=async()=>{calls++;return Response.json({background:calls>1,payments:false});};await Promise.all([refreshConfig(),refreshConfig()]);await refreshConfig();assert.equal(calls,2);assert.deepEqual(parent,child);assert.equal(parent[0].background,false);assert.equal(parent[1].background,true);}finally{offParent();offChild();globalThis.fetch=oldFetch;}
});
test('HTML diagnostics omit recovery tokens and query strings',async()=>{
 const response=new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}});Object.defineProperty(response,'url',{value:'https://example.test/signin?token=private#key=secret'});Object.defineProperty(response,'redirected',{value:true});
 await assert.rejects(readJSON(response),e=>{assert.equal(e.diagnostic.finalPath,'/signin');assert.equal(e.diagnostic.redirected,true);assert(!JSON.stringify(e.diagnostic).includes('private'));return true;});
});
test('download preflight rejects HTML sign-in pages and expired links without parsing a HEAD body',async()=>{
 const {checkDownload}=await import('../lib/client-api.mjs');const old=globalThis.fetch;
 try{
  globalThis.fetch=async(path,opts)=>{assert.equal(opts.method,'HEAD');assert.equal(opts.credentials,'same-origin');return new Response(null,{headers:{'Content-Type':'application/zip'}});};await checkDownload('/api/jobs/download?token=secret');
  globalThis.fetch=async()=>new Response(null,{status:403,headers:{'Content-Type':'application/json'}});await assert.rejects(checkDownload('/api/jobs/download?token=secret'),e=>e.status===403&&/expired/.test(e.message));
  globalThis.fetch=async()=>new Response(null,{status:502,headers:{'Content-Type':'text/html'}});await assert.rejects(checkDownload('/api/jobs/download?token=secret'),e=>e.diagnostic.requestPath==='/api/jobs/download'&&!JSON.stringify(e.diagnostic).includes('secret'));
 }finally{globalThis.fetch=old;}
});
test('a redirect to a non-login HTML error is not automatically labelled authentication failure',async()=>{
 const response=new Response('<html>upstream failure</html>',{status:502,headers:{'Content-Type':'text/html'}});
 Object.defineProperty(response,'url',{value:'https://parcel.test/unavailable?token=secret'});Object.defineProperty(response,'redirected',{value:true});
 await assert.rejects(readJSON(response,'/api/jobs'),e=>e.session===false&&e.diagnostic.redirected===true&&e.diagnostic.finalPath==='/unavailable');
});
