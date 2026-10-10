import {startCheckout} from '../../../../lib/agency-billing';
import {boundedJSON,rate,respondError} from '../../../../lib/guard';
import {requireSameOrigin} from '../../../../lib/payment.mjs';
// POST {code, email?} → {key, url}. The key is returned now (and must be saved by the browser) because the account exists
// before Stripe is involved; the browser then follows url to Stripe Checkout.
export async function POST(request:Request){try{requireSameOrigin(request);await rate(request,'agency-checkout',5,86400000);const body=await boundedJSON(request,2000);const result=await startCheckout(body);return Response.json(result,{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
