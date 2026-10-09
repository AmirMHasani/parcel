// Never expose a JSON parser exception or an HTML gateway page to the customer.
export async function readJSON(response,requestPath=''){
 const type=response.headers.get('content-type')||'';
 if(!type.includes('application/json')){
  const finalPath=(()=>{try{return new URL(response.url).pathname;}catch{return '';}})();
  const auth=[401,403].includes(response.status)||['/signin-with-chatgpt','/signin','/login'].includes(finalPath);
  const error=new Error(auth?'Your private-site session needs to be refreshed. Reload this page and sign in, then reopen your saved return link.':'The export service returned an unexpected page. Your saved job is preserved. Retry the connection in a moment. If it continues, note the error details for support.');
  error.status=response.status;error.session=auth;
  const safePath=value=>{try{return new URL(value, 'https://parcel.invalid').pathname;}catch{return '';}};
  error.diagnostic={requestPath:safePath(requestPath),status:response.status,contentType:type,redirected:response.redirected,finalPath:safePath(response.url),requestId:response.headers.get('cf-ray')||response.headers.get('x-request-id')||null};
  try{sessionStorage.setItem('parcel-last-api-error',JSON.stringify({...error.diagnostic,time:new Date().toISOString()}));}catch{}
  console.warn('Parcel API response',error.diagnostic);
  throw error;
 }
 let result;try{result=await response.json();}catch{throw new Error('The export service returned an incomplete response. Retry the connection; do not upload your CSV again.');}
 if(!response.ok){const error=new Error(result.error||'The request could not be completed. Please try again.');error.status=response.status;throw error;}
 return result;
}
export async function api(path,options={}){
 const headers=new Headers(options.headers);headers.set('Accept','application/json');
 return readJSON(await fetch(path,{...options,headers,credentials:'same-origin',cache:'no-store',signal:options.signal||AbortSignal.timeout(30000)}),path);
}
export function recoveryAccess(href,read){
 const url=new URL(href),fragment=new URLSearchParams(url.hash.slice(1));
 const id=fragment.get('export')||url.searchParams.get('export');
 let saved=null;try{saved=JSON.parse(read(id?'parcel-job:'+id:'parcel-job')||'null');if(id&&!saved){const last=JSON.parse(read('parcel-job')||'null');if(last?.id===id)saved=last;}}catch{}
 const key=fragment.get('key')||saved?.key;
 if(id)return key?{id,key}:null;
 return saved?.id&&saved?.key?saved:null;
}
export function resultsPath(access){return '/results?export='+encodeURIComponent(access.id)+'#key='+encodeURIComponent(access.key);}

const configListeners=new Set();
let configRequest=null;
export function subscribeConfig(listener){configListeners.add(listener);return ()=>{configListeners.delete(listener);};}
export function refreshConfig(){
 if(!configRequest)configRequest=api('/api/config').then(value=>{for(const listener of configListeners)listener(value);return value;}).finally(()=>{configRequest=null;});
 return configRequest;
}

// Verify session/access before handing a URL to the browser download manager.
// HEAD never buffers the package or consumes its transfer allowance.
export async function checkDownload(path){
 const response=await fetch(path,{method:'HEAD',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)});
 const type=response.headers.get('content-type')||'';
 if(response.ok&&type.includes('application/zip'))return;
 if(!type.includes('application/json')&&!type.includes('application/zip'))return readJSON(response,path);
 const error=new Error([401,403].includes(response.status)?'Your download link or private-site session expired. Retry Download ZIP; if this continues, reload and sign in again.':response.status===429?'Download limit reached. Try again after the limit resets.':'Your ZIP is temporarily unavailable. Return to your results and retry Download ZIP.');
 error.status=response.status;throw error;
}
