// This text describes the frozen outcome. Recovery always shows the latest job state.
export function notificationMessage(job,url){
 const failed=job.state==='failed',partial=job.state==='partial';
 const subject=failed?'Your Parcel export needs attention':partial?'Your Parcel export is partially ready':'Your Parcel export is ready';
 const outcome=failed?`Your export could not be completed. ${job.completed} images were saved, but no downloadable ZIP is ready. Open your results to review the error and any available retry options.`:partial?`Your ZIP is ready with ${job.completed} saved images. ${job.failed} images could not be saved. The ZIP includes a failed-downloads.csv report; review your results before downloading or paying.`:`Your ZIP is ready with ${job.completed} saved images.`;
 const payment=failed?'No payment is required to review the error.':job.refund_state?'Download access is unavailable while the payment is under review.':job.payment_intent?'Payment is confirmed. No additional payment is needed.':job.amount?`Payment is required to download. Price: $${(job.amount/100).toFixed(2)} USD.`:'Your export is free.';
 return {subject,text:`${outcome}\n\nView your results: ${url}\n\n${payment}\nYour private results link expires at ${new Date(job.expires).toISOString()}. Keep this link private.${failed?'':' Download links last up to one hour, without extending package expiry; return to the results page to renew one.'}`};
}
