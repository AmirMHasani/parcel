import {guides} from '../lib/seo';

// Homepage section that introduces the how-to guides.
export default function GuidesSection(){
  return <section id="guides" className="guides-home" aria-labelledby="guides-home-title">
    <div className="section-title">
      <div><span className="eyebrow">HOW-TO GUIDES</span><h2 id="guides-home-title">Guides for common Shopify image jobs.</h2></div>
      <a className="nav-cta" href="/guides">All guides</a>
    </div>
    <ul className="guide-cards">{guides.map(g=><li key={g.path}><a href={g.path}><strong>{g.label}</strong><span>{g.description}</span></a></li>)}</ul>
  </section>;
}
