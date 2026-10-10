import {pageMetadata} from '../../../lib/seo';
import {agencyEnabled} from '../../../lib/launch';
import PolicyPage from '../../../components/PolicyPage';
import AgencyAccount from '../../../components/AgencyAccount';
export const dynamic='force-dynamic';
export function generateMetadata(){return pageMetadata('/agency/account','Your Agency Account','Your Parcel Agency plan: usage this month, billing, exports and your private key.');}
export default function Account(){if(!agencyEnabled())return <PolicyPage title="Agency account"><p>The Agency plan is not available yet.</p></PolicyPage>;return <PolicyPage title="Your Agency account"><AgencyAccount/></PolicyPage>;}
