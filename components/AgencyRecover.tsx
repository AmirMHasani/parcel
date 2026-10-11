'use client';
// Lost-key recovery: ask for the billing email; the answer is the same whether or not it matches an account.
import {useState} from 'react';
import {api} from '../lib/client-api.mjs';
export default function AgencyRecover(){
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await api('/api/agency/recover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim()})});setSent(true);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 if(sent)return <p className="notice">If that email belongs to an Agency account, a recovery link is on its way. It works once, within one hour, and gives you a new key. Your current key keeps working until the link is used.</p>;
 return <>
  <p>Enter the email you used at checkout. We will send a link that issues a new agency key; the old key stops working once you use it.</p>
  <form onSubmit={submit}>
   <label className="email-field" htmlFor="recover-email">Billing email<input id="recover-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@agency.com" autoComplete="email" maxLength={254} required disabled={busy}/></label>
   <button className="primary" type="submit" disabled={busy}>{busy?'Sending…':'Send recovery link'}</button>
  </form>
  {error&&<div className="error" role="alert">{error}</div>}
  <p className="muted">No email on file? Contact support from the <a href="/support">support page</a> with your Stripe receipt.</p>
 </>;
}
