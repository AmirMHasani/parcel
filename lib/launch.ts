export function supportEmail(){const value=process.env.SUPPORT_EMAIL||'';return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)?value:null;}
export function paymentsReady(){return process.env.PAYMENTS_ENABLED==='1'&&process.env.POLICIES_APPROVED==='1'&&!!supportEmail()&&!!(process.env.STRIPE_SECRET_KEY||(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET));}

export function stripeReady(){return paymentsReady()&&!!process.env.STRIPE_SECRET_KEY;}
export function paypalReady(){return paymentsReady()&&!!process.env.PAYPAL_CLIENT_ID&&!!process.env.PAYPAL_CLIENT_SECRET;}

// Agency subscription plan. Off by default; staging turns it on first, production only at the single release (docs/agency-runbook.md).
export function agencyEnabled(){return process.env.AGENCY_ENABLED==='1';}
