import SiteFooter from '../../components/SiteFooter';
import {guides,guideGroups,guidesHub,guideMetadata,siteOrigin} from '../../lib/seo';

export function generateMetadata(){return guideMetadata(guidesHub.path);}

// Guides hub: every how-to guide, grouped by the job it helps with.
export default function GuidesHub(){
  const origin=siteOrigin();
  const schema={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Parcel',item:origin+'/'},{'@type':'ListItem',position:2,name:'Guides',item:origin+guidesHub.path}]};
  return <main id="main-content" className="policy-page guide-page guides-hub">
    <a className="brand" href="/">parcel.</a>
    <h1>Shopify product image guides</h1>
    <p className="guides-intro">Practical guides for getting your product images out of Shopify and putting them to work. Each one covers the free manual method and the faster way with Parcel.</p>
    {guideGroups.map(group=><section key={group.id} className="guide-group" aria-labelledby={'group-'+group.id}>
      <h2 id={'group-'+group.id}>{group.title}</h2>
      <ul className="guide-cards">{guides.filter(g=>g.group===group.id).map(g=><li key={g.path}><a href={g.path}><strong>{g.heading}</strong><span>{g.description}</span></a></li>)}</ul>
    </section>)}
    <a className="primary" href="/#exporter">Pack your first export</a>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema).replace(/</g,'\\u003c')}}/>
    <SiteFooter/>
  </main>;
}
