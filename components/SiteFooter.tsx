import {guides} from '../lib/seo';

// Shared footer for every customer-facing page, in columns.
export default function SiteFooter(){
  return <footer className="site-footer">
    <div className="footer-brand">
      <a className="brand" href="/">parcel<span className="brand-dot">.</span></a>
      <span className="footer-tagline">Less busywork. More store.</span>
    </div>
    <nav className="footer-col footer-product" aria-labelledby="footer-product-title"><span id="footer-product-title" className="footer-heading">Product</span><a href="/#exporter">Export images</a><a href="/pricing">Pricing</a><a href="/csv-guide">CSV guide</a><a href="/support">Support</a></nav>
    <nav className="footer-col footer-guides" aria-labelledby="footer-guides-title"><span id="footer-guides-title" className="footer-heading">Guides</span>{guides.map(g=><a key={g.path} href={g.path}>{g.label}</a>)}<a className="footer-all" href="/guides">All guides</a></nav>
    <nav className="footer-col footer-policies" aria-labelledby="footer-policies-title"><span id="footer-policies-title" className="footer-heading">Policies</span><a href="/refunds">Refunds</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
    <small className="footer-legal">© 2026 Lumen Collective LLC. Independent tool, not affiliated with Shopify.</small>
  </footer>;
}
