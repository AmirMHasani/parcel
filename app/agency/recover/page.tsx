import {pageMetadata} from '../../../lib/seo';
import {agencyEnabled} from '../../../lib/launch';
import PolicyPage from '../../../components/PolicyPage';
import AgencyRecover from '../../../components/AgencyRecover';
export const dynamic='force-dynamic';
export function generateMetadata(){return pageMetadata('/agency/recover','Recover Your Agency Key','Get a new Parcel Agency key by email if you lost yours.');}
export default function Recover(){if(!agencyEnabled())return <PolicyPage title="Recover your agency key"><p>The Agency plan is not available yet.</p></PolicyPage>;return <PolicyPage title="Recover your agency key"><AgencyRecover/></PolicyPage>;}
