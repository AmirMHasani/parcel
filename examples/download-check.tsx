'use client';
import {useState,useEffect,useRef} from 'react';
export default function DownloadCheck(){
 const [status,setStatus]=useState(''),[url,setURL]=useState('');const current=useRef('');
 useEffect(()=>()=>{if(current.current)URL.revokeObjectURL(current.current);},[]);
 function ready(blob:Blob){if(current.current)URL.revokeObjectURL(current.current);current.current=URL.createObjectURL(blob);setURL(current.current);}
 return <main style={{maxWidth:720,margin:'60px auto',padding:24}}><a href="/">Back to Parcel</a><h1>Download check</h1><p>These checks contain sample data only. They do not create an export or require payment.</p><p><button className="secondary" onClick={()=>{ready(new Blob(['Parcel download test\n'],{type:'text/plain'}));setStatus('A 21-byte test file is ready.');}}>Prepare a tiny test file</button></p><p><a href="/sample-shopify-products.csv" download>Download sample CSV directly</a></p><p><button className="secondary" onClick={async()=>{try{setStatus('Checking sample transfer…');const r=await fetch('/sample-shopify-products.csv',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const blob=await r.blob();if(!r.headers.get('content-type')?.includes('csv'))throw Error('Unexpected file type');ready(blob);setStatus('Sample received: '+blob.size+' bytes. Ready to save.');}catch(e:any){setStatus('Transfer failed: '+e.message);}}}>Check sample transfer</button></p>{url&&<p><a className="primary" href={url} download="parcel-download-check.txt">Save test file</a></p>}<p role="status">{status}</p></main>;
}
