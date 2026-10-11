import {findAccount,listExports} from '../../../../lib/agency';
import {rate,respondError} from '../../../../lib/guard';
import {zipFileName} from '../../../../lib/zip-name.mjs';
// GET with x-agency-key → the account's exports for the current billing period, newest first.
export async function GET(request:Request){try{await rate(request,'agency-exports',120,3600000);const account=await findAccount(request);const exports=await listExports(account);return Response.json({exports:exports.map(e=>({...e,fileName:zipFileName({id:e.id,agency_id:account.id,client_name:e.clientName})}))},{headers:{'Cache-Control':'no-store'}});}catch(e){return respondError(e);}}
