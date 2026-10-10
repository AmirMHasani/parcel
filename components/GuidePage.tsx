import type {ReactNode} from 'react';
import SiteFooter from './SiteFooter';
import {guides,siteOrigin} from '../lib/seo';

// Shared layout for the evergreen how-to guides. Follows the /csv-guide
// pattern: brand link, heading, content, call to action, footer.
export default function GuidePage({path,children}:{path:string,children:ReactNode}){
  const guide=guides.find(g=>g.path===path);
  if(!guide)throw Error('Unknown guide '+path);
  const origin=siteOrigin();
  const schema={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Parcel',item:origin+'/'},{'@type':'ListItem',position:2,name:guide.heading,item:origin+guide.path}]};
  const related=guides.filter(g=>g.path!==path);
  return <main id="main-content" className="policy-page guide-page">
    <a className="brand" href="/">parcel.</a>
    <h1>{guide.heading}</h1>
    {children}
    <a className="primary" href="/#exporter">Pack your first export</a>
    <section className="related-guides" aria-labelledby="related-guides-title">
      <h2 id="related-guides-title">Related guides</h2>
      <ul>{related.map(g=><li key={g.path}><a href={g.path}>{g.heading}</a></li>)}</ul>
    </section>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema).replace(/</g,'<')}}/>
    <SiteFooter/>
  </main>;
}
