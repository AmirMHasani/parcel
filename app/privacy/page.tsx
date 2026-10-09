import {pageMetadata} from '../../lib/seo';
import PolicyPage from '../../components/PolicyPage';
export function generateMetadata(){return pageMetadata('/privacy','Privacy Policy','Understand how Parcel uses product CSV data, image metadata, optional email addresses, payment references, and private recovery links.');}
export default function Privacy(){return <PolicyPage title="Privacy policy">
  <p>Effective October 7, 2026.</p>
  <p>Parcel uses the information needed to prepare your image export, recover saved results, prevent abuse, and handle payment or support issues. No Shopify store connection is required.</p>
  <h2>What you upload</h2>
  <p>Your CSV is read and parsed in your browser. The application does not upload the original CSV file.</p>
  <p>For a saved background export, selected image metadata is sent to the server, including image URLs, product handles, titles, SKUs, positions, alt text, and your export options. The service stores this metadata, downloaded images, and the generated ZIP archive to prepare and recover your package. Include only the product information needed for your export.</p>
  <h2>Optional email notifications</h2>
  <p>You can optionally save an email address with your export. If delivery is not yet configured, the interface says so; the request stays queued and can be sent only if delivery is enabled before the export expires. Keep your private return link because email delivery is not guaranteed. The address and recovery key are encrypted at rest in the notification queue. Resend receives the address and results link to send the requested notification. Queue payloads are cleared after the provider accepts the message or removed when the export expires. Delivery and retry status may remain until expiry. The notification is transactional; the address is not used by Parcel for marketing.</p>
  <h2>Payments</h2>
  <p>When checkout is available, payments take place on Stripe or PayPal. Parcel does not collect card numbers. It stores the export price, payment-provider references, payment status, and any billing-review or correction status needed to authorize downloads and reconcile transactions. Payment providers handle your payment information under their own privacy policies.</p>
  <h2>Browser storage and private links</h2>
  <p>Your browser may store the export IDs and recovery keys locally and a pending export attempt in session storage. Clearing that storage can remove your ability to return without the original recovery link. Anyone who has your recovery link can access the associated results while the link remains valid. Keep recovery links private and avoid including them in support messages.</p>
  <h2>Usage limits and operational records</h2>
  <p>Parcel uses a salted hash of your IP address or available hosting identity to enforce usage limits. Error records help diagnose failures and abuse. Hosting providers may also process IP addresses, request headers, and operational logs as part of running and protecting the service.</p>
  <h2>How long information is kept</h2>
  <p>Processing has a 24-hour deadline from submission. Once results are ready, download access lasts 24 hours. The scheduled worker removes stored metadata files, images, ZIP data, and sensitive notification payloads after expiry. Minimal failed-email records remain until reviewed by the operator. Physical deletion can be delayed during a service interruption.</p>
  <p>Job records, usage records, payment references, and billing-review information are separate from the downloadable files. Job and payment records remain beyond the download window for recovery and reconciliation; no fixed automatic deletion period currently applies to them. Application error records are scheduled for removal after seven days.</p>
  <h2>Service providers</h2>
  <p>Sites and Cloudflare provide hosting, database, and file storage. Render runs scheduled background processing. Shopify’s CDN provides source images. Resend is used for enabled email notifications, and Stripe or PayPal is used for enabled checkout. Providers receive information necessary for their role in delivering the requested service.</p>
  <h2>Your choices and privacy requests</h2>
  <p>You can use Parcel without creating a separate Parcel account, omit the optional email address, and clear saved export information from your browser. Clearing browser storage does not delete server records. For questions or a request concerning your information, see <a href="/support">Support</a>. Include the export ID and the information involved; do not include card details or a recovery key. Requests may require verification and are subject to applicable retention obligations.</p>
  <p>Do not upload customer records, passwords, API tokens, payment information, or other sensitive personal information. This policy may be updated as the service changes; the effective date identifies the current version.</p>
</PolicyPage>;}
