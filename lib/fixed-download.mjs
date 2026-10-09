// Workers only preserve Content-Length for a fixed-length body. A normal
// ReadableStream silently becomes chunked, even when the header is supplied.
export function fixedDownload(stream,length,onFailure){
 if(typeof FixedLengthStream==='undefined')return stream; // Node route tests
 const {readable,writable}=new FixedLengthStream(length);
 void stream.pipeTo(writable).catch(async error=>{try{await onFailure(error);}catch{}});
 return readable;
}
