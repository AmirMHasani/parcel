'use client';
// The agency account page: status, usage this period, export history, billing (Stripe portal), resubscribe, key rotation.
// The key lives in this browser's storage; it can also arrive from a recovery link (?recover=token) or be typed in.
import {useEffect,useRef,useState} from 'react';
import {api,readAgency,saveAgency,clearAgency} from '../lib/client-api.mjs';
const fmtDate=(ms:number|null)=>ms?new Date(ms).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):'—';
const fmtMB=(b:number)=>(b/1000000).toFixed(1)+' MB';
export default function AgencyAccount(){
 const [key,setKey]=useState<string|null>(null),[account,setAccount]=useState<any>(null),[exportsList,setExports]=useState<any[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[revealed,setRevealed]=useState<string|null>(null),[typed,setTyped]=useState(''),[loaded,setLoaded]=useState(false);
 const polls=useRef(0);
 async function loadAccount(k:string,quiet=false){try{const a:any=await api('/api/agency/session',{headers:{'x-agency-key':k}});setAccount(a);setError('');if(a.status!=='pending'&&readAgency()?.pending)saveAgency({key:k,pending:false});try{const list:any=await api('/api/agency/exports',{headers:{'x-agency-key':k}});setExports(list.exports||[]);}catch{}return a;}catch(e:any){if(!quiet)setError(e.message);if(e.status===404)setAccount(null);return null;}}
 useEffect(()=>{(async()=>{const params=new URLSearchParams(location.search);const token=params.get('recover');
  if(token){history.replaceState(null,'',location.pathname);try{const r:any=await api('/api/agency/recover/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});saveAgency({key:r.key,pending:false});setKey(r.key);setRevealed(r.key);setNotice('Here is your new agency key. Your previous key no longer works.');await loadAccount(r.key);}catch(e:any){setError(e.message);}setLoaded(true);return;}
  const saved=readAgency();if(!saved){setLoaded(true);return;}setKey(saved.key);
  const a=await loadAccount(saved.key,true);setLoaded(true);
  if(params.get('checkout')==='complete'){history.replaceState(null,'',location.pathname);if(saved.pending)setRevealed(saved.key);if(a?.status==='pending'){const timer=setInterval(async()=>{polls.current++;const fresh=await loadAccount(saved.key,true);if(fresh&&fresh.status!=='pending'||polls.current>40){clearInterval(timer);if(fresh&&fresh.status!=='pending')setNotice('Your subscription is active. Save your agency key below.');else if(polls.current>40)setNotice('Payment is still being confirmed. This page will show your plan as soon as Stripe confirms it; the worker also finishes it within a couple of minutes.');}},3000);}else if(a)setNotice('Your subscription is active. Save your agency key below.');}
 })();},[]);
 async function post(path:string,label:string){if(busy)return;setBusy(label);setError('');try{const r:any=await api(path,{method:'POST',headers:{'x-agency-key':key!}});if(r.url){location.href=r.url;return;}return r;}catch(e:any){setError(e.message);}finally{setBusy('');}}
 async function rotate(){if(!confirm('Create a new key? The current key stops working immediately, including in any other browser where you saved it.'))return;const r=await post('/api/agency/rotate','rotate');if(r?.key){saveAgency({key:r.key,pending:false});setKey(r.key);setRevealed(r.key);setNotice('New key created. Save it; the old key no longer works.');}}
 function useTyped(e:React.FormEvent){e.preventDefault();const k=typed.trim().toLowerCase();if(!/^[a-f0-9]{64}$/.test(k)){setError('An agency key is 64 letters and digits.');return;}saveAgency({key:k,pending:false});setKey(k);setTyped('');loadAccount(k);}
 function forget(){if(!confirm('Remove the agency key from this browser? Your subscription continues; you will need the key to come back.'))return;clearAgency();setKey(null);setAccount(null);setExports([]);setRevealed(null);}
 async function copy(){try{await navigator.clipboard.writeText(revealed!);setNotice('Key copied.');}catch{setNotice('Copy failed. Select the key and copy it by hand.');}}
 if(!loaded)return <p className="muted">Loading your account…</p>;
 if(!key||!account&&!revealed)return <>
  {error&&<div className="error" role="alert">{error}</div>}
  <p>No agency key is saved in this browser. Paste your key, or <a href="/agency/recover">recover it by email</a>. Don’t have a plan yet? <a href="/agency">Start with your invite code</a>.</p>
  <form onSubmit={useTyped}><label className="email-field" htmlFor="agency-key">Agency key<input id="agency-key" value={typed} onChange={e=>setTyped(e.target.value)} autoComplete="off" spellCheck={false} maxLength={64} required/></label><button className="primary" type="submit">Open my account</button></form>
 </>;
 const status=account?.status,remaining=account?.remaining??0,limit=account?.limit??50,used=account?.used??0;
 const statusText:any={active:account?.cancelAtPeriodEnd?'Active · cancels on '+fmtDate(account.periodEnd):'Active · renews on '+fmtDate(account?.periodEnd),past_due:'Payment failed · update your card to keep exporting',pending:'Waiting for Stripe to confirm payment…',free:'No active subscription',suspended:'Suspended · contact support'};
 return <>
  {notice&&<p className="notice" role="status">{notice}</p>}
  {error&&<div className="error" role="alert">{error}</div>}
  {revealed&&<section className="agency-key-box" aria-label="Your agency key"><h2>Your agency key</h2><p>Save this somewhere safe. It is shown once per visit and is the only way back into your account from another browser.</p><code className="agency-key">{revealed}</code><p><button className="primary" type="button" onClick={copy}>Copy key</button> <button type="button" className="text-button" onClick={()=>setRevealed(null)}>Hide</button></p></section>}
  {account&&<>
  <div className="job-metrics agency-metrics"><div><strong>{used}<small> / {limit}</small></strong><span>exports used</span></div><div><strong>{remaining}</strong><span>remaining{account.warning&&remaining>0?' · running low':''}</span></div><div><strong>{fmtDate(account.periodEnd).replace(/, \d{4}$/,'')}</strong><span>{status==='active'&&account.cancelAtPeriodEnd?'access ends':status==='active'?'next renewal':'period end'}</span></div></div>
  <p className="agency-status"><strong>Plan status:</strong> {statusText[status]||status}</p>
  {remaining===0&&status==='active'&&<p className="notice">You have used all {limit} exports for this period. Extra exports run at the one-time price until {fmtDate(account.periodEnd)}.</p>}
  <h2>Billing</h2>
  <p>{account.email?<>Billing email: {account.email}. </>:null}Card changes, invoices and cancellation are handled on Stripe’s secure page. Cancelling keeps your access until the end of the paid month; there are no refunds for part of a month.</p>
  <p>
   {(status==='active'||status==='past_due')&&<button className="primary" type="button" disabled={!!busy} onClick={()=>post('/api/agency/portal','portal')}>{busy==='portal'?'Opening…':status==='past_due'?'Update card':'Manage billing or cancel'}</button>}{' '}
   {status==='free'&&<button className="primary" type="button" disabled={!!busy} onClick={()=>post('/api/agency/resubscribe','resub')}>{busy==='resub'?'Opening Stripe…':'Resubscribe · $49/month'}</button>}
  </p>
  <h2>Exports this period</h2>
  {exportsList.length===0?<p className="muted">No exports yet this period. Start one from the <a href="/#exporter">exporter</a>; with your key saved here, it will run as an agency export.</p>:
  <div className="guide-table"><table><thead><tr><th>Started</th><th>Client / file</th><th>Images</th><th>Status</th><th></th></tr></thead><tbody>{exportsList.map(e=><tr key={e.id}><td>{new Date(e.created).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</td><td>{e.clientName||<span className="muted">—</span>}<br/><small>{e.fileName}</small></td><td>{e.completed}{e.failed?<small> · {e.failed} failed</small>:null}<br/><small>{fmtMB(e.bytes)}</small></td><td>{e.state}{!e.countsTowardLimit&&<small><br/>not counted</small>}</td><td>{e.state!=='expired'&&e.state!=='cancelled'?<a href={'/results?export='+encodeURIComponent(e.id)}>Open</a>:null}</td></tr>)}</tbody></table></div>}
  <p className="muted">Results stay available for 24 hours after an export is ready. Cancelled exports and exports that saved no images do not count toward your {limit}.</p>
  <h2>Your key</h2>
  <p>Your agency key is saved in this browser. Anyone with the key can run exports on your plan, so treat it like a password.</p>
  <p><button type="button" className="text-button" disabled={!!busy} onClick={rotate}>Create a new key</button> · <button type="button" className="text-button" onClick={forget}>Remove key from this browser</button> · <a href="/agency/recover">Recover by email</a></p>
  </>}
 </>;
}
