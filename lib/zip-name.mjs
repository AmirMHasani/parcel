// ZIP naming and the download header. Agency exports are white-labelled at the file level: the ZIP is named after the
// agency's client (or neutrally after the export) instead of "parcel-<id>.zip". Pure JavaScript so the browser, the
// download route and the tests share one definition.
export const CLIENT_NAME_MAX=60;

// What an agency may type as a client name: letters and digits in any script, spaces, dashes, underscores, dots.
// Everything else is dropped; runs of spaces collapse; the result is trimmed and capped. Empty → null.
export function cleanClientName(value){
 if(typeof value!=='string')return null;
 const cleaned=value.normalize('NFKC').replace(/[^\p{L}\p{N} ._-]+/gu,'').replace(/\s+/g,' ').trim().slice(0,CLIENT_NAME_MAX).trim();
 return cleaned||null;
}

// "Acme Store" → "acme-store"; keeps non-Latin letters (the header handles encoding). Empty → null.
export function slug(value){
 const s=String(value||'').normalize('NFKC').toLowerCase().replace(/[\s._]+/g,'-').replace(/[^\p{L}\p{N}-]+/gu,'').replace(/-+/g,'-').replace(/^-|-$/g,'');
 return s||null;
}

export function zipFileName(job){
 const short=String(job?.id||'').slice(0,8)||'export';
 if(job?.agency_id||job?.agency){const base=slug(job.client_name??job.clientName);return (base||'export-'+short)+'-images.zip';}
 return 'parcel-'+(job?.id||short)+'.zip';
}

// RFC 6266 / 5987: an ASCII-only filename for old clients plus filename* with the real UTF-8 name.
export function contentDisposition(name){
 const ascii=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'-').replace(/["\\]/g,'-').replace(/-+/g,'-').replace(/^-+/,'');
 // If nothing readable survives before "-images.zip" (e.g. a CJK client name), use a neutral ASCII name.
 const fallback=/[a-z0-9]/i.test(ascii.replace(/-?images\.zip$/i,'').replace(/\.zip$/i,''))?ascii:'export-images.zip';
 const encoded=encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 return 'attachment; filename="'+fallback+'"'+(fallback===name?'':"; filename*=UTF-8''"+encoded);
}
