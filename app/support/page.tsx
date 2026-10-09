import {pageMetadata} from '../../lib/seo';
import {supportEmail} from '../../lib/launch';
import PolicyPage from '../../components/PolicyPage';
export const dynamic='force-dynamic';
export function generateMetadata(){return pageMetadata('/support','Shopify Image Export Help','Troubleshoot Shopify CSV uploads, recover saved packages, retry failed images, and get help with downloads or billing.');}
export default function Support(){const email=supportEmail();return <PolicyPage title="Help and support">
  <p>Start with the steps below for CSV uploads, saved exports, and downloads. Keep your export ID and the exact error message if you need to report a problem.</p>
  <h2>Upload a Shopify product CSV</h2>
  <ol><li>Export the product CSV from Shopify and keep the header row.</li><li>Check that it contains a product handle and at least one product-image or variant-image column.</li><li>Upload the CSV, review the product and image counts, and choose your filename and folder options.</li><li>Use <a href="/csv-guide">the CSV guide</a> or <a href="/sample-shopify-products.csv" download>download the sample CSV</a> if the file is not recognized.</li></ol>
  <p>Files must be CSVs under the 10 MB upload limit. Images must use public HTTPS URLs on cdn.shopify.com. JPG, PNG, WebP, GIF, and AVIF images are supported. Other hosts, private URLs, and URLs that do not return a supported image cannot be exported.</p>
  <h2>Recover a saved package</h2>
  <p>Open your private recovery link or visit <a href="/results">Your export results</a> in the same browser you used to start the saved export. A link is needed to recover it on another browser or device. Clearing browser storage or using private browsing can prevent automatic recovery.</p>
  <p>Copy and keep the recovery link before leaving the page. Anyone with the link can access the associated results, so do not share it publicly.</p>
  <h2>Processing seems slow or paused</h2>
  <p>Large images, other queued exports, unavailable source servers, and usage limits can extend the estimate. Saved processing continues after you close the tab. Keep your private return link so you can check progress later.</p>
  <p>Return through the recovery link to check saved progress. If the worker is temporarily unavailable, wait and check again. Avoid submitting the same CSV repeatedly; each new submission can count toward your daily export limit.</p>
  <h2>Some images failed</h2>
  <p>If a ZIP is ready, download it and inspect failed-downloads.csv for affected URLs and errors. Open an affected URL to check whether the source image is still available. Saved partial or failed exports can offer up to two retries while access remains valid. Successful images are reused, but unavailable source files may still fail.</p>
  <h2>A ZIP link did not work</h2>
  <p>Individual saved-package download links last up to one hour, capped at package expiry. Return to your results page and click Download again to get a fresh link. Download the single ZIP using the primary button or its direct-link fallback. Check your device’s Downloads folder, available disk space, and network connection.</p>
  <p>The package itself expires 24 hours after it becomes ready. A fresh download link cannot restore an expired package. Keep your own copies before the displayed expiry time.</p>
  <h2>Payments and billing issues</h2>
  <p>When paid checkout is available, review the saved and failed image counts and the price before paying. One verified payment unlocks the complete ZIP until expiry. If you return from payment and downloads are still locked, reopen the original results page and allow payment verification to finish before trying another purchase.</p>
  <p>Completed purchases are final under our <a href="/refunds">no-refund policy</a>. For a suspected billing error, use “Report a billing issue” when that option appears on your saved export and retain the review reference. This records the issue for review and does not guarantee a refund. Payment-provider corrections are complete only when confirmed by the provider.</p>
  <h2>Contact and privacy requests</h2>
  {email?<p>For technical support, billing questions, or privacy requests, email <a href={'mailto:'+email}>{email}</a>. Include your export ID, error message, device/browser, and the steps that led to the issue. For billing questions, include the payment receipt or review reference.</p>:<p>Direct email support is currently unavailable. Use the recovery and troubleshooting steps above, and keep your export ID and any billing-review reference. Paid checkout remains unavailable until a support contact is active.</p>}
  <p>Do not include passwords, card numbers, recovery keys, or private results links in support messages. A response time is not guaranteed. See our <a href="/privacy">privacy policy</a> for the information used to provide the service.</p>
</PolicyPage>;}
