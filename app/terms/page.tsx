import {pageMetadata} from '../../lib/seo';
import PolicyPage from '../../components/PolicyPage';
export function generateMetadata(){return pageMetadata('/terms','Terms of Use','Terms for using Parcel’s Shopify image exporter, prepared packages, payments, download access, and no-refund policy.');}
export default function Terms(){return <PolicyPage title="Terms of use">
  <p>Effective October 9, 2026.</p>
  <p>These terms govern use of Parcel’s image-export service. By using the service, you agree to these terms and acknowledge the <a href="/privacy">privacy policy</a>. Review the <a href="/refunds">no-refund policy</a> before purchasing an export.</p>
  <p>Parcel is operated by Lumen Collective LLC (“we” or “us”). Contact us at <a href="mailto:support@parcelexport.com">support@parcelexport.com</a>.</p>
  <h2>What Parcel provides</h2>
  <p>Parcel reads a Shopify product CSV and retrieves supported public image URLs to produce ZIP files with your chosen filenames, product folders, and optional manifests. It does not connect to your Shopify admin, edit your store, or provide long-term image storage.</p>
  <h2>Your responsibilities</h2>
  <p>Use Parcel only for images and information you own or have permission to access, download, and use. Downloading an image does not grant ownership or a license to it. You are responsible for checking the CSV, export options, saved results, and your intended use of the files.</p>
  <p>Do not upload sensitive customer information, credentials, or payment details. Do not bypass access controls or usage limits, interfere with other users, or use the service for unlawful purposes. Access or processing may be limited to protect the service from misuse.</p>
  <h2>Supported files and export results</h2>
  <p>Supported URLs and limits appear on the <a href="/csv-guide">CSV guide</a> and <a href="/pricing">pricing page</a>. Parcel exports the exact files available at the supplied URLs. A URL that points to a resized image produces that resized file. Image URLs may change, expire, or become unavailable, and an export may complete partially or fail.</p>
  <p>One ZIP file is produced. Download your package and check any failed-downloads.csv report. The sample CSV is for testing Parcel and should not be imported into Shopify to modify a catalog.</p>
  <h2>Prices and payment</h2>
  <p>Prices are shown in USD before payment. Purchases are per export, with no subscription. Paid saved packages are prepared before checkout; payment is required to unlock downloads. One verified payment unlocks the complete ZIP and redownloads within the existing access window. Only payment methods shown as available can be used.</p>
  <p><strong>Completed purchases are final and discretionary refunds are not offered.</strong> Changing your mind, selecting the wrong settings, or missing the download deadline does not qualify for a refund. Billing errors and exceptions required by applicable law are handled as described in the <a href="/refunds">no-refund policy</a>.</p>
  <h2>Recovery, expiry, and retries</h2>
  <p>Saved exports continue after the tab closes when background processing is available. Keep your private recovery link to return from another browser or device.</p>
  <p>Processing has a 24-hour deadline from submission. Results remain accessible for 24 hours after becoming ready. Paying or retrying does not extend that access window. Individual download links last two minutes and can be renewed from the results page. Download and keep your own copies before expiry.</p>
  <p>Partial or failed work may be retried up to twice when the results page offers that option. Successful images are reused. Retrying does not guarantee that an unavailable source image can be recovered.</p>
  <h2>Availability and estimates</h2>
  <p>Processing times are estimates. Queues, file sizes, source-server availability, usage limits, and service interruptions can delay or prevent processing. Parcel does not promise uninterrupted availability, a fixed completion time, or recovery of every source image. The service is provided as available, subject to rights that cannot be excluded under applicable law.</p>
  <h2>Support and billing questions</h2>
  <p>Use the <a href="/support">support page</a> for recovery steps and billing-review instructions. Keep the export ID and payment receipt. A recorded review request does not promise a refund or a particular response time.</p>
  <h2>Independent service and updates</h2>
  <p>Parcel is independent and is not affiliated with Shopify or merchants featured in sample files. Shopify and other names remain the property of their respective owners.</p>
  <p>These terms may be updated as the service changes. Updated terms apply to use after their effective date; they do not remove rights attached to an earlier purchase. Nothing in these terms limits rights or remedies that applicable law does not allow to be excluded.</p>
</PolicyPage>;}
