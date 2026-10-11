import {findAccount} from '../../../../lib/agency';
import {resubscribe,refreshStatus} from '../../../../lib/agency-billing';
import {rate,respondError} from '../../../../lib/guard';
import {requireSameOrigin} from '../../../../lib/payment.mjs';
// POST with x-agency-key → {url} of a new Checkout for an account whose subscription ended. No invite code needed.
export async function POST(request:Request){try{requireSameOrigin(request);await rate(request,'agency-resubscribe',5,86400000);const account=await refreshStatus(await findAccount(request));return Response.json({url:await resubscribe(account)},{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
