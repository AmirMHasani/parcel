export function byteRange(value,size){
 if(!value)return {start:0,end:size-1,partial:false};
 const match=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!match||(!match[1]&&!match[2]))return null;
 const a=match[1]?Number(match[1]):null,b=match[2]?Number(match[2]):null;
 if((a!==null&&!Number.isSafeInteger(a))||(b!==null&&!Number.isSafeInteger(b)))return null;
 const start=a===null?Math.max(0,size-b):a,end=a===null?size-1:b===null?size-1:Math.min(b,size-1);
 return start>=size||start<0||end<start?null:{start,end,partial:true};
}
