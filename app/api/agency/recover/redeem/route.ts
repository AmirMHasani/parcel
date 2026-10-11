import {redeemRecovery,requireAgencyPlan,summary} from '../../../../../lib/agency';
import {boundedJSON,rate,respondError} from '../../../../../lib/guard';
import {requireSameOrigin} from '../../../../../lib/payment.mjs';
// POST {token} → {key, account}. The token comes from the recovery email and works once, within an hour.
export async function POST(request:Request){try{requireSameOrigin(request);requireAgencyPlan();await rate(request,'agency-redeem',10,3600000);const body:any=await boundedJSON(request,2000);const {account,key}=await redeemRecovery(body?.token);return Response.json({key,account:await summary(account)},{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
