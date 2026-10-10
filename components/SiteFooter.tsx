// Shared footer for every page: brand, information links and the operator line.
export default function SiteFooter(){
  return <footer className="site-footer">
    <a className="brand" href="/">parcel<span className="brand-dot">.</span></a>
    <span className="footer-tagline">Less busywork. More store.</span>
    <nav className="footer-links" aria-label="Information pages"><a href="/pricing">Pricing</a><a href="/csv-guide">CSV guide</a><a href="/support">Support</a><a href="/refunds">Refunds</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
    <small className="footer-legal">© 2026 Lumen Collectives LLC. Independent tool, not affiliated with Shopify.</small>
  </footer>;
}
