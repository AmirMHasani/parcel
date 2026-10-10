import {findAccount,rotateKey} from '../../../../lib/agency';
import {rate,respondError} from '../../../../lib/guard';
import {requireSameOrigin} from '../../../../lib/payment.mjs';
// POST with x-agency-key → a new key; the old one stops working at once. The browser must save the new key.
export async function POST(request:Request){try{requireSameOrigin(request);await rate(request,'agency-rotate',5,86400000);const account=await findAccount(request);const key=await rotateKey(account);return Response.json({key},{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
