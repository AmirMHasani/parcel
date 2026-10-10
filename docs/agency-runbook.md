# Agency plan — operator runbook

Living document for the $49/month Agency subscription (invite-only beta). The development plan, decisions and release
steps are in the Parcel project docs (`agency-subscription-plan.md`, `agency-after-phase-6.md`). This file holds the
hands-on steps an operator needs. Everything below is for **staging** (`parcel-staging`, Stripe test mode) until the
single production release.

## Stripe dashboard setup (test mode first, live at release)

1. **Restricted key with subscription permissions.** The existing restricted key is for one-time Checkout only. Create a
   new restricted key with: Checkout Sessions (write), Customers (write), Subscriptions (read), Billing Portal (write),
   Products and Prices (read), Charges (read), Invoices (read). Store it as the `STRIPE_SECRET_KEY` secret on staging:
   `CLOUDFLARE_ENV=staging pnpm exec wrangler secret put STRIPE_SECRET_KEY`.
2. **Product and price.** Product "Parcel Agency", recurring price USD 49.00 monthly. Copy the price id (`price_...`) into
   `wrangler.jsonc` → `env.staging.vars.STRIPE_AGENCY_PRICE_ID`. Production's copy stays empty until the release.
3. **Terms of service URL.** Settings → Business → Public details → set the Terms URL to `https://parcelexport.com/terms`.
   Checkout is created with `consent_collection[terms_of_service]=required`; Stripe rejects the session if this URL is
   missing.
4. **Customer Portal.** Settings → Billing → Customer portal: turn on "Update payment method", "Cancel subscriptions" with
   *cancel at end of billing period* only (no immediate cancel, no prorated refunds), "Invoice history". Turn off plan
   switching. Save once so a default configuration exists; the portal API fails without one.
5. **Smart Retries and emails.** Settings → Billing → Subscriptions and emails: enable Smart Retries; after the final
   failed retry, **cancel** the subscription. Enable customer emails for successful payments, upcoming renewals and
   failed payments. Parcel does not send billing emails itself.

## Staging: apply the migration and deploy the branch

```
git checkout agency
CLOUDFLARE_ENV=staging pnpm exec wrangler d1 migrations apply DB --remote
CLOUDFLARE_ENV=staging pnpm build && pnpm exec wrangler deploy
```
`AGENCY_ENABLED` is already `1` for staging in `wrangler.jsonc`. Never run these without `CLOUDFLARE_ENV=staging`.

Rehearsal before the first staging apply (and again at release): `pnpm exec wrangler d1 export parcel-db --remote
--output prod-copy.sql`, load it into a local SQLite file, apply `drizzle/0005_agency_plan.sql`, confirm existing
exports are untouched. Delete the copy afterwards; it contains customer job metadata.

## Issue an invite code

```
node scripts/agency-admin.mjs code AGENCY-BETA
CLOUDFLARE_ENV=staging pnpm exec wrangler d1 execute DB --remote --command "<printed SQL>"
```
One code per agency; a code can be used once. A code reserved by an abandoned checkout is released automatically
(expired Stripe session, or no Stripe session after an hour).

## Create a test account by hand (no Stripe)

`node scripts/agency-admin.mjs account you@example.com` prints a key and the SQL for an `active` account valid 30 days.
Run the SQL with `wrangler d1 execute` as above. Give the key to the tester privately; it is shown once and never stored.

## Check an account

`curl -H "x-agency-key: <key>" https://<staging host>/api/agency/session` returns status, usage and period dates. A
`pending` account whose Stripe Checkout completed becomes `active` on this call (or within two minutes by the worker).

## Re-send or rotate a key

- The agency can rotate from the account page (Phase 5) or `POST /api/agency/rotate` with the old key.
- Support cannot read a key back (only its hash is stored). To re-issue: create a new key with the admin script and
  `UPDATE agency_accounts SET key_hash='<hash>' WHERE id='<account id>'`, then send the key privately.

## Pause the plan

Set `AGENCY_ENABLED` to `0` and redeploy. All agency routes return 404, new agency exports stop, and finished exports
remain downloadable until they expire. Stripe keeps billing; cancel subscriptions in the dashboard if the pause is long.

## What the worker does for the plan (once a minute, inside cleanup)

- Finishes activation for `pending` accounts whose Checkout completed but whose browser never came back (after 2 min).
- Releases codes and deletes `pending` accounts that never reached Stripe (after 1 hour) or whose session expired.
- Re-checks one account a day past its 24-hour status age against Stripe, and suspends the account if any charge for
  that customer is disputed. Failures push the next attempt out an hour and are logged as `agency_sweep_error`.
