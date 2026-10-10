import {pageMetadata} from '../../lib/seo';
import PolicyPage from '../../components/PolicyPage';
export function generateMetadata(){return pageMetadata('/refunds','No-Refund Policy','Parcel purchases are final. Review prepared results, download access, failed-image retries, and billing-error corrections before paying.');}
export default function Refunds(){return <PolicyPage title="No-refund policy">
  <p>Effective October 9, 2026.</p>
  <p className="notice"><strong>All completed purchases are final. We do not offer discretionary refunds.</strong> Please check your prepared results and the export price before paying.</p>
  <p>Parcel is operated by Lumen Collective LLC. Billing questions can be sent to <a href="mailto:support@parcelexport.com">support@parcelexport.com</a>.</p>
  <h2>Check your package before payment</h2>
  <p>Saved packages are prepared before checkout. The results page shows how many images were saved, how many failed, and the package price. Payment unlocks the prepared ZIP. A package with no successfully saved images cannot be purchased through the normal download flow.</p>
  <h2>When refunds are not available</h2>
  <p>We do not offer refunds for changing your mind, uploading the wrong CSV, selecting the wrong filename or folder options, duplicate purchases you intentionally make, or deciding that you no longer need the images. Refunds are not available for source-image quality, unavailable source URLs shown in the prepared results, or failing to download before expiry.</p>
  <h2>Partial exports and retries</h2>
  <p>A partial package contains the images that were successfully downloaded. Check the saved and failed counts before paying. Partial packages are not eligible for discretionary refunds. Where available, you can retry failed work up to twice within the existing access window without paying again. Retries do not guarantee recovery of unavailable images or extend the package expiry.</p>
  <h2>Download access</h2>
  <p>Results remain available for 24 hours after the package becomes ready, including time before payment. One payment unlocks the complete ZIP and redownloads during that window. Individual download links last two minutes; return to the results page to renew a link. Save the complete ZIP on your own device before the displayed expiry time.</p>
  <h2>Billing errors and required exceptions</h2>
  <p>This policy does not remove rights provided by applicable law or your payment provider. Duplicate charges caused by a processing error, incorrect charges, or a charge without delivery of the purchased package may be reviewed and corrected. The system may reverse a payment captured after expiry or for an export that delivered no images. These are billing corrections, not a change-of-mind refund policy.</p>
  <p>For a billing issue, keep your export ID, payment receipt, and any review reference. See <a href="/support">Support</a> for help. A payment-review request records the issue; it does not promise a refund.</p>
</PolicyPage>;}
