import {pageMetadata} from '../../lib/seo';
import BackgroundExport from '../../components/BackgroundExport';
import SiteFooter from '../../components/SiteFooter';
import {Package,ArrowLeft,ShieldCheck} from 'lucide-react';
export function generateMetadata(){return pageMetadata('/results','Your Export Results','View your saved Parcel package, pay if required, and download one ZIP.');}
export default function Results(){return <><header className="results-nav"><a className="brand" href="/"><Package size={25}/>parcel<span className="brand-dot">.</span></a><a href="/support">Need help?</a></header><main id="main-content" className="results-page"><a className="results-back" href="/"><ArrowLeft size={16}/> Back to Parcel</a><div className="results-intro"><span className="eyebrow">YOUR PRIVATE EXPORT</span><h1>Your export.<br/>All in one place.</h1><p>Check your progress, review your package, and download one organized ZIP.</p></div><BackgroundExport resultsOnly/><p className="results-footer"><ShieldCheck size={16}/> Your private link works for 24 hours after the package is ready.</p><SiteFooter/></main></>;}
