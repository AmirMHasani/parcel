import {findAccount} from '../../../../lib/agency';
import {portalUrl,refreshStatus} from '../../../../lib/agency-billing';
import {rate,respondError} from '../../../../lib/guard';
import {requireSameOrigin} from '../../../../lib/payment.mjs';
// POST with x-agency-key → {url} of the Stripe Customer Portal (change card, cancel at period end, invoices).
export async function POST(request:Request){try{requireSameOrigin(request);await rate(request,'agency-portal',20,3600000);const account=await refreshStatus(await findAccount(request));return Response.json({url:await portalUrl(account)},{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
