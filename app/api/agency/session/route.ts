import {findAccount,summary} from '../../../../lib/agency';
import {respondError} from '../../../../lib/guard';
// GET with x-agency-key → plan status and usage for the account page and export form. 404 while AGENCY_ENABLED is off.
export async function GET(request:Request){try{const account=await findAccount(request);return Response.json(await summary(account),{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
