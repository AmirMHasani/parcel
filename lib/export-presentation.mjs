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
// Shown while an export waits to start: its place in line and estimated wait.
// Falls back to null when the server did not send queue details.
// When there is free capacity the export starts right away, so no position is shown.
export function queueMessage(job){
 if(job?.state!=='queued'||!Number.isInteger(job.queuePosition)||job.queuePosition<1)return null;
 const ready=Number(job.etaSeconds)>0?' · ready in about '+Math.max(1,Math.ceil(job.etaSeconds/60))+' min':'';
 if(job.busy===false)return 'Starting now'+ready+'. You can leave this page.';
 const place=job.queuePosition===1?'You’re next in line':'You’re #'+job.queuePosition+' in line';
 const start=Number(job.startSeconds)>=60?'about '+Math.ceil(job.startSeconds/60)+' min':'under a minute';
 return place+' · estimated start: '+start+ready+'. You can leave this page.';
}
// Shown while images are saving and more exports are active than can run at once.
export function busyMessage(job){
 if(job?.state!=='downloading'||!job.busy||!(Number(job.etaSeconds)>0))return null;
 return 'Parcel is busy, so exports are taking turns. Estimated ready in about '+Math.max(1,Math.ceil(job.etaSeconds/60))+' min. You can leave this page.';
}
