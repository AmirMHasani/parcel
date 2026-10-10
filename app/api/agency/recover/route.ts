import {createRecovery,requireAgencyPlan} from '../../../../lib/agency';
import {boundedJSON,rate,respondError,HttpError} from '../../../../lib/guard';
import {supportEmail} from '../../../../lib/launch';
import {emailReady,sendEmail} from '../../../../lib/notifications';
import {siteOrigin} from '../../../../lib/seo';
import {requireSameOrigin} from '../../../../lib/payment.mjs';
// POST {email}. Always answers {ok:true} whether or not the email matches an account, so it cannot be used to probe.
// If it matches, a one-hour link is emailed; opening it issues a NEW key (the old one keeps working until then).
export async function POST(request:Request){try{requireSameOrigin(request);requireAgencyPlan();await rate(request,'agency-recover',5,3600000);const body:any=await boundedJSON(request,2000);const email=typeof body?.email==='string'?body.email.trim():'';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new HttpError(400,'Enter the email address you used at checkout.');if(!emailReady())throw new HttpError(503,'Key recovery by email is not available yet. Email '+(supportEmail()||'support')+' and we will help.');
 const found=await createRecovery(email);
 if(found){const link=siteOrigin()+'/agency/account?recover='+found.token;await sendEmail({to:email,subject:'Your Parcel Agency access link',text:'Someone asked to recover the Parcel Agency key for this email address.\n\nOpen this link within one hour to get a new key:\n'+link+'\n\nYour current key keeps working until the link is used. If you did not ask for this, you can ignore this email.'},'agency-recover-'+found.account.id+'-'+Math.floor(Date.now()/600000));}
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
