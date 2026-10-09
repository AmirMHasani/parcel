import {requireSameOrigin} from '../../../lib/payment.mjs';
import {boundedJSON,rate,respondError,HttpError} from '../../../lib/guard';
export async function POST(request:Request){try{requireSameOrigin(request);await rate(request,'checkout',10);await boundedJSON(request);throw new HttpError(409,'Paid exports use background processing. Start a background export to continue.');}catch(e){return respondError(e);}}
