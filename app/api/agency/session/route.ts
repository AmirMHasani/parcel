import {findAccount,summary} from '../../../../lib/agency';
import {refreshStatus} from '../../../../lib/agency-billing';
import {respondError} from '../../../../lib/guard';
// GET with x-agency-key → plan status and usage. Also finishes activation after Stripe Checkout and refreshes the
// cached subscription status (at most every 10 minutes). 404 while AGENCY_ENABLED is off.
export async function GET(request:Request){try{const account=await refreshStatus(await findAccount(request));return Response.json(await summary(account),{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
