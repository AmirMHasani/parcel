export function exportPresentation(job){
 const ready=['complete','partial'].includes(job?.state);
 const packing=job?.state==='packing'||job?.state==='downloading'&&job.total>0&&job.completed+job.failed>=job.total;
 const titles={complete:'Your ZIP is ready',partial:'Your ZIP is ready with some missing images',failed:'This export needs attention',cancelled:'Export cancelled',expired:'This export has expired',queued:'Waiting to start',awaiting_payment:'Waiting for payment'};
 const title=titles[job?.state]||(packing?'Building your ZIP':'Saving your images');
 const processed=Math.min(job?.total||0,(job?.completed||0)+(job?.failed||0));
 return {ready,packing,title,percent:ready?100:Math.min(99,Math.round(processed/Math.max(1,job?.total||0)*90)+(packing?5:0))};
}
export function observedETA(previous,current,elapsedMs){
 if(!previous||previous.id!==current.id||current.state!=='downloading'||elapsedMs<1000)return null;
 const done=current.completed+current.failed,delta=done-previous.completed-previous.failed;
 if(delta<=0||done>=current.total)return null;
 return Math.ceil((current.total-done)*elapsedMs/delta/1000);
}
