import {pageMetadata} from '../../lib/seo';
import {paymentsReady} from '../../lib/launch';
import PolicyPage from '../../components/PolicyPage';
export const dynamic='force-dynamic';
export function generateMetadata(){return pageMetadata('/pricing','Pricing for Shopify Image Exports','Parcel’s free Shopify image-export tier, one-time package prices, supported file limits, and 24-hour download access.');}
export default function Pricing(){const paid=paymentsReady();return <PolicyPage title="Simple, per-export pricing">
  <p>Export up to 25 products with supported images for free. Larger packages use a one-time payment in USD. There is no subscription.</p>
  {!paid&&<p className="notice">Free exports are available. Paid checkout is currently unavailable; use a CSV with up to 25 products.</p>}
  <div className="guide-table"><table><thead><tr><th>Products with images</th><th>Price</th><th>Status</th></tr></thead><tbody>{[['Up to 25','$0','Available'],['26–250','$9',paid?'Pay at checkout':'Currently unavailable'],['251–1,000','$19',paid?'Pay at checkout':'Currently unavailable'],['Over 1,000','$39',paid?'Pay at checkout':'Currently unavailable']].map(row=><tr key={row[0]}>{row.map(cell=><td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>
  <h2>What counts as a product?</h2>
  <p>Pricing counts distinct product handles with supported image URLs. Products without supported images do not count. Multiple images of one product count as one product. Review the parsed count before starting; source-image failures do not automatically lower the quoted product tier.</p>
  <h2>What is included?</h2>
  <p>Choose filenames based on SKU, product handle, or the original filename; group files by product or in a single folder; and include an image manifest. Unsuccessful image downloads are listed in failed-downloads.csv. Every package is delivered as one ZIP file.</p>
  <h2>Prepare first, pay when downloading</h2>
  <p>When paid exports are available, saved packages are prepared before checkout. Review the saved and failed image counts and the displayed price before paying. A package with no saved images cannot be purchased through the normal download flow. One payment unlocks the complete ZIP and redownloads until the package expires.</p>
  <p><strong>Completed purchases are final; no discretionary refunds.</strong> Read the <a href="/refunds">no-refund policy</a> and <a href="/terms">terms</a> before checkout.</p>
  <h2>File and usage limits</h2>
  <p>CSV uploads have a 10 MB limit. Each export supports up to 10,000 images, with a 20 MB limit per image. Saved exports allow up to 300 MB of image data for free packages and 1 GB for paid packages. The paid tiers remain subject to these limits.</p>
  <p>Saved processing allows five new jobs per client per day and two active jobs per client. Two jobs can process at once across the service; additional work waits in the queue. Transfer and download limits may delay processing or downloads. Split oversized catalogs into smaller exports.</p>
  <h2>How long are files available?</h2>
  <p>Saved results remain accessible for 24 hours after the package becomes ready. The window starts before payment; paying and retrying do not extend it. Individual download links last two minutes and can be renewed from the results page within that window.</p>
  <p>Exports require available background processing and can continue after the tab closes. Download the complete ZIP and keep your own backups. See <a href="/support">Support</a> for help.</p>
</PolicyPage>;}
