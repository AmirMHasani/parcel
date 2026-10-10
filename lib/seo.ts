import type {Metadata} from 'next';
export const homeDescription='Download Shopify product images from your CSV into organized ZIP files. Name images by SKU, group by product, and include a manifest. Free up to 25 products.';
export function siteOrigin(){const raw=process.env.PUBLIC_SITE_URL||'https://parcelexport.com';try{const u=new URL(raw);if(u.protocol==='https:'&&!u.username&&!u.password)return u.origin;}catch{}return 'https://parcelexport.com';}
// Explicit launch switch: private previews and customer exports must never be indexed.
// Evergreen how-to guides (SEO landing pages). Titles get " | Parcel" from the layout template.
export const guides=[
  {path:'/guides/download-all-shopify-product-images',title:'Download All Shopify Product Images in One ZIP',description:'Download all your Shopify product images in one ZIP: the free manual method step by step, plus a faster tool that organizes files by product and SKU.',heading:'How to download all product images from Shopify in one ZIP',label:'Download all Shopify product images',group:'export'},
  {path:'/guides/backup-shopify-product-images',title:'Back Up Shopify Product Images Before Deleting',description:'How to back up your Shopify product images before deleting products or closing your store: the free method and a faster organized ZIP export.',heading:'Back up Shopify product images before deleting products',label:'Back up Shopify product images',group:'export'},
  {path:'/guides/export-shopify-images-by-sku',title:'Export Shopify Product Images Named by SKU',description:'Export Shopify product images with filenames based on SKU: the free manual renaming method and a tool that names every file by SKU automatically.',heading:'Export Shopify product images named by SKU',label:'Export Shopify images by SKU',group:'export'},
  {path:'/guides/migrate-shopify-to-woocommerce-images',title:'Move Shopify Product Images to WooCommerce',description:'Moving from Shopify to WooCommerce? Take your product images with you: the free manual method and a faster way to get an organized ZIP.',heading:'Moving from Shopify to WooCommerce: take your product images with you',label:'Move Shopify images to WooCommerce',group:'move'},
  {path:'/guides/export-shopify-images-marketplace',title:'Export Shopify Images for Amazon, Etsy, eBay',description:'Need your Shopify product images for Amazon, Etsy, or eBay? Get actual SKU-named files instead of CDN links: the free method plus a faster tool.',heading:'Export Shopify product images for Amazon, Etsy, or eBay listings',label:'Shopify images for Amazon, Etsy, eBay',group:'move'},
  {path:'/guides/find-shopify-images-missing-alt-text',title:'Find Shopify Product Images Missing Alt Text',description:'Audit your Shopify image alt text: export a spreadsheet of every image with its alt text, filter the blanks, and fix them in Shopify.',heading:'Find Shopify product images missing alt text',label:'Find images missing alt text',group:'audit'},
] as const;
export const guideGroups=[
  {id:'export',title:'Export and back up'},
  {id:'move',title:'Move images to another platform'},
  {id:'audit',title:'Audit your catalog'},
] as const;
export const guidePaths:string[]=guides.map(g=>g.path);
export const guidesHub={path:'/guides',title:'Shopify Product Image Guides',description:'Step-by-step guides for downloading, backing up, renaming, migrating and auditing Shopify product images, with a free manual method and a faster option for each.'};
export function indexable(path:string){return process.env.SEO_INDEXABLE==='1'&&(['/','/pricing','/support','/csv-guide',guidesHub.path].includes(path)||guidePaths.includes(path))||process.env.SEO_INDEXABLE==='1'&&process.env.POLICIES_APPROVED==='1'&&['/terms','/privacy','/refunds'].includes(path);}
export function pageMetadata(path:string,title:string,description:string):Metadata{const url=siteOrigin()+path;return {title,description,alternates:{canonical:url},robots:{index:indexable(path),follow:indexable(path),...(path==='/results'?{nosnippet:true}:{})},openGraph:{type:'website',locale:'en_US',siteName:'Parcel',title:title+' | Parcel',description,url,images:[{url:siteOrigin()+'/social-card.png',width:1200,height:630,alt:'Parcel — Shopify product image exporter'}]},twitter:{card:'summary_large_image',title:title+' | Parcel',description,images:[siteOrigin()+'/social-card.png']}};}
// Guide pages avoid em dashes everywhere, including the share-image alt text.
function plainShareImage(meta:Metadata):Metadata{return {...meta,openGraph:{...meta.openGraph,images:[{url:siteOrigin()+'/social-card.png',width:1200,height:630,alt:'Parcel: Shopify product image exporter'}]}};}
export function guideMetadata(path:string):Metadata{if(path===guidesHub.path)return plainShareImage(pageMetadata(guidesHub.path,guidesHub.title,guidesHub.description));const g=guides.find(x=>x.path===path);if(!g)throw Error('Unknown guide '+path);return plainShareImage(pageMetadata(g.path,g.title,g.description));}
export function sitemapPaths(){const paths=['/','/pricing','/csv-guide',guidesHub.path,...guidePaths,'/support','/privacy','/terms','/refunds'];return paths.filter(indexable);}
