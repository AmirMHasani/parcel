'use client';
// Invite-code form on /agency. On success the key is saved in this browser as "pending" and the browser goes to Stripe.
import {useEffect,useState} from 'react';
import {api,readAgency,saveAgency} from '../lib/client-api.mjs';
export default function AgencyJoin({ready}:{ready:boolean}){
 const [code,setCode]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[existing,setExisting]=useState<any>(null),[cancelled,setCancelled]=useState(false);
 useEffect(()=>{setExisting(readAgency());setCancelled(new URLSearchParams(location.search).get('checkout')==='cancelled');},[]);
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const r:any=await api('/api/agency/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code.trim(),email:email.trim()||undefined})});if(!saveAgency({key:r.key,pending:true}))throw Error('This browser is blocking storage, so your key could not be saved. Enable site storage or use another browser.');location.href=r.url;}catch(e:any){setError(e.message);setBusy(false);}}
 return <section className="agency-join" aria-label="Start your Agency subscription">
  <h2>Start with your invite code</h2>
  {cancelled&&<p className="notice">Checkout was cancelled. Nothing was charged. You can start again below.</p>}
  {existing&&!existing.pending&&<p className="notice">This browser already holds an agency key. <a href="/agency/account">Open your account</a>.</p>}
  {existing?.pending&&<p className="notice">A checkout was started from this browser. If you completed payment, <a href="/agency/account?checkout=complete">open your account</a> to finish setting up. Otherwise start again below.</p>}
  {!ready&&<p className="notice">Agency subscriptions are not open right now. If you were invited, email support and we will help.</p>}
  <form onSubmit={submit}>
   <label className="email-field" htmlFor="invite-code">Invite code<input id="invite-code" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="AGENCY-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={40} required disabled={busy||!ready}/></label>
   <label className="email-field" htmlFor="billing-email">Billing email <span>Optional, pre-fills Stripe and lets you recover a lost key</span><input id="billing-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@agency.com" autoComplete="email" maxLength={254} disabled={busy||!ready}/></label>
   <button className="primary" type="submit" disabled={busy||!ready}>{busy?'Opening Stripe…':'Continue to Stripe · $49/month'}</button>
  </form>
  {error&&<div className="error" role="alert">{error}</div>}
  <p className="muted">Payment is handled by Stripe. Parcel never sees your card number.</p>
 </section>;
}
