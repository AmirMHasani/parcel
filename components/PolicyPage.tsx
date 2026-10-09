import type {ReactNode} from 'react';
export default function PolicyPage({title,children}:{title:string,children:ReactNode}){
  return <main id="main-content" className="policy-page">
    <a className="brand" href="/">parcel.</a>
    <nav aria-label="Information pages"><a href="/pricing">Pricing</a><a href="/csv-guide">CSV guide</a><a href="/support">Support</a><a href="/refunds">Refunds</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
    <h1>{title}</h1>{children}
    <p className="policy-back"><a href="/">← Back to the exporter</a></p>
  </main>;
}
