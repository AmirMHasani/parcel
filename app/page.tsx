import Home from '../components/Home';
import {pageMetadata,siteOrigin,homeDescription} from '../lib/seo';
import {paymentsReady} from '../lib/launch';
// Rendered per request so the price cards match the live payment configuration.
export const dynamic='force-dynamic';
export function generateMetadata(){return pageMetadata('/', 'Shopify Product Image Downloader & Exporter', homeDescription);}
export default function Page(){const origin=siteOrigin();const schema={'@context':'https://schema.org','@graph':[{'@type':'WebSite','@id':origin+'/#website',name:'Parcel',url:origin+'/'},{'@type':'WebApplication','@id':origin+'/#app',name:'Parcel Shopify Product Image Exporter',url:origin+'/',applicationCategory:'BusinessApplication',operatingSystem:'Web browser',description:homeDescription,featureList:['Shopify CSV image export','SKU and product-handle filenames','Product folders','CSV manifests','Saved background packages']}]};return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema).replace(/</g,'\\u003c')}}/><Home paidLive={paymentsReady()}/></>;}
