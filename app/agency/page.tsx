import {pageMetadata} from '../../lib/seo';
import {agencyEnabled} from '../../lib/launch';
import {billingReady} from '../../lib/agency-billing';
import PolicyPage from '../../components/PolicyPage';
import AgencyJoin from '../../components/AgencyJoin';
export const dynamic='force-dynamic';
// Unlisted during the beta: never indexed, never in the sitemap (lib/seo.ts only whitelists marketing pages).
export function generateMetadata(){return pageMetadata('/agency','Agency Plan','Parcel’s Agency plan for migration agencies and freelancers: 50 exports a month, priority processing, white-label ZIPs, cancel anytime.');}
export default function Agency(){if(!agencyEnabled())return <PolicyPage title="Agency plan"><p>The Agency plan is not available yet. See <a href="/pricing">pricing</a> for current options.</p></PolicyPage>;return <PolicyPage title="Agency plan">
  <p className="lede-copy">For migration agencies and freelancers. All your clients, one flat price.</p>
  <div className="guide-table"><table><tbody>
    <tr><th>Price</th><td>$49 per month, billed monthly in USD. Cancel anytime; access continues to the end of the paid month.</td></tr>
    <tr><th>Included</th><td>50 exports per month (fair-use cap), up to 1 GB of images per export, priority processing, white-label ZIPs and reports.</td></tr>
    <tr><th>Beyond 50</th><td>Extra exports run at the normal one-time price until your month resets.</td></tr>
    <tr><th>Beta</th><td>Invite-only. You need an invite code from Parcel support.</td></tr>
  </tbody></table></div>
  <AgencyJoin ready={billingReady()}/>
  <h2>How it works</h2>
  <p>Enter your invite code and you are taken to Stripe to start the subscription. When you return, Parcel shows your private agency key once. Save it: it is how this browser recognises your account, and it opens every export you run. If you lose it, <a href="/agency/recover">recover it</a> with the email you used at checkout.</p>
  <p>Exports started with your agency key skip the payment step, allow up to 1 GB of images, go ahead of one-time exports in the queue, and can be named after your client. The manifest and failed-downloads files carry no Parcel branding. The results pages and emails still show Parcel.</p>
  <p>Read the <a href="/terms">terms</a> and the <a href="/refunds">refund policy</a> before subscribing: subscription payments are not refunded for part of a month.</p>
</PolicyPage>;}
