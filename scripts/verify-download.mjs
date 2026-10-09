import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
// Independent expected values must come from the stored archive, not this response.
export async function verifyDownload(response,{bytes,sha256}){
 if(!Number.isSafeInteger(bytes)||bytes<0||!/^[a-f0-9]{64}$/i.test(sha256))throw Error('Expected byte count and SHA-256 are required.');
 if(response.status!==200)throw Error('Download returned HTTP '+response.status);
 if(!(response.headers.get('content-type')||'').includes('application/zip'))throw Error('Expected a ZIP response.');
 const hash=createHash('sha256');let received=0;
 if(!response.body)throw Error('Download body is missing.');
 for await(const chunk of response.body){received+=chunk.length;if(received>bytes)throw Error('Download exceeds expected size.');hash.update(chunk);}
 const actual=hash.digest('hex');
 if(received!==bytes)throw Error('Download byte count does not match stored archive.');
 if(actual!==sha256.toLowerCase())throw Error('Download SHA-256 does not match stored archive.');
 return {bytes:received,sha256:actual};
}
// Pipe JSON through stdin; never pass signed URLs or credentials as command arguments.
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>16384)throw Error('Input too large.');}
  const {url,authorization,bytes,sha256}=JSON.parse(input);const target=new URL(url);
  if(target.protocol!=='https:'||target.username||target.password)throw Error('An HTTPS URL without embedded credentials is required.');
  const headers=authorization?{'OAI-Sites-Authorization':'Bearer '+authorization}:{};
  const response=await fetch(target,{headers,redirect:'error',signal:AbortSignal.timeout(600000)});
  console.log(JSON.stringify(await verifyDownload(response,{bytes,sha256})));
 }catch{console.error('Download verification failed. Check access, HTTP response, expected size and SHA-256. No credentials have been logged.');process.exitCode=1;}
}
