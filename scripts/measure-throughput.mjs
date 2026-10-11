#!/usr/bin/env node
// Measures real processing throughput on staging for the Agency plan's capacity target (plan, Phase 4).
// Starts one export from a CSV-derived item list and polls its status until it is ready, then prints images per
// minute and total minutes. Run against staging only; it creates a real export there.
//
//   node scripts/measure-throughput.mjs https://parcel-staging.<account>.workers.dev items.json [agency-key]
//
// items.json is the "items" array the homepage would send ([{handle,title,sku,position,url,alt}]); make one by
// running the CSV through lib/export.mjs parseCSV, or save the request body from the browser's network tab.
// Pass an agency key to measure an agency (priority) export; omit it for a one-time export.
import {readFileSync} from 'node:fs';
const [site,file,agencyKey]=process.argv.slice(2);
if(!site||!file){console.error('usage: measure-throughput.mjs <site origin> <items.json> [agency key]');process.exit(1);}
if(!/staging/.test(site))console.warn('warning: this starts a real export — intended for staging');
const items=JSON.parse(readFileSync(file,'utf8'));
const key=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
const headers={'content-type':'application/json','origin':site,...(agencyKey?{'x-agency-key':agencyKey}:{})};
const password=process.env.SITE_ACCESS_PASSWORD;if(password)headers.authorization='Basic '+Buffer.from('parcel:'+password).toString('base64');
const started=Date.now();
const create=await fetch(site+'/api/jobs',{method:'POST',headers,body:JSON.stringify({attempt:crypto.randomUUID(),key,items,options:{mode:'sku',folders:true,manifest:true}})});
const job=await create.json();if(!create.ok){console.error('create failed',job);process.exit(1);}
console.log(JSON.stringify({id:job.id,total:job.total,priority:job.priority,queuePosition:job.queuePosition,etaSeconds:job.etaSeconds}));
let last=null;
while(true){await new Promise(r=>setTimeout(r,5000));const r=await fetch(site+'/api/jobs/status?id='+job.id,{headers:{...headers,'x-export-key':key}});const s=await r.json();
 const line=`${s.state} ${s.completed+s.failed}/${s.total} +${Math.round((Date.now()-started)/1000)}s`;if(line!==last){console.log(line);last=line;}
 if(['complete','partial','failed','cancelled','expired'].includes(s.state)){const minutes=(s.readyAt-s.created)/60000;console.log(JSON.stringify({state:s.state,images:s.completed,failed:s.failed,minutes:+minutes.toFixed(2),imagesPerMinute:+(s.completed/Math.max(minutes,0.01)).toFixed(1),bytes:s.bytes}));break;}}
