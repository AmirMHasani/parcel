# Parcel launch runbook

## Current state

Moving to Cloudflare (October 9, 2026): Worker `parcel` on Amir's Cloudflare account, D1 `parcel-db`, R2 `parcel-exports`, Cron Trigger every minute (replaces Render). While testing, the whole site sits behind the SITE_ACCESS_PASSWORD browser password. BACKGROUND_EXPORTS=1; PAYMENTS_ENABLED=0 until sandbox acceptance. Runtime secrets are managed with `wrangler secret put`; non-secret settings in `wrangler.jsonc` vars. The previous owner-private ChatGPT Sites deployment and its Render cron (crn-db32evrtqb8s73dup0mg) can be suspended once the Cloudflare deployment is verified. Do not describe integrations as activated until the checks below pass.

## Ready results and concurrency

Every saved export enters the processing queue before payment. Each runner POST drives two concurrent worker ticks. Database leases enforce at most two processing jobs globally, with oldest next_run first for fairness. ZIP packaging is exclusive and limited to 20 MB of original images per internal segment to protect the 128 MB Worker memory allowance. No Render command change is needed: the installed runner calls this updated server endpoint.

Processing has a 24-hour deadline from submission. Completed/partial/failed results start a new 24-hour access window; retries do not extend it. /results recovers through a private fragment link. Anyone with that link can access the result, so keep it private. Download authorization is separately signed, bound to one export and part, valid for up to one hour (capped at package expiry), and checked against current expiry/payment/refund state. Returning to the results page mints a fresh link. One verified payment unlocks the complete ZIP and repeated downloads until expiry.

The interface estimates remaining image-check time from observed progress between status polls and identifies ZIP packing separately. When progress cannot be measured, it shows an estimating or queue message. Estimates are approximate, not an SLA. The API also retains a rough capacity estimate for diagnostics.

## Email activation

Use a Resend account and a verified sending domain. Add Cloudflare secrets (`wrangler secret put`) and `wrangler.jsonc` vars:
- RESEND_API_KEY (secret, send-only scope).
- EMAIL_FROM (verified address, optionally with display name).
- PUBLIC_SITE_URL=the public https origin (custom domain once attached).

Deploy to apply configuration. Optional email entry is editable before processing. Requests are encrypted and queued even while delivery awaits configuration, with an explicit warning to keep the return link. The sender runs only when configured and never sends expired jobs. Email is transactional and carries a results link, never a ZIP attachment or a payment bypass. The address/key and frozen message are encrypted with EXPORT_SIGNING_SECRET in D1. The outbox leases sends, uses a stable Resend idempotency key and identical retry payload, and retries transient failures up to six attempts within the export window. Successful provider acceptance clears sensitive payloads. Expiry deletes outbox rows. A provider acceptance is not proof of inbox delivery. No marketing emails are sent.

Before activation, submit a test export using an owner-controlled address, close the page, verify provider delivery, reopen the email link in another browser, and inspect its expiration. Exercise a provider outage and restart without duplicate notification. Inspect /api/ops email counts and error events. Resend reference: https://resend.com/docs/api-reference/emails/send-email and https://resend.com/changelog/idempotency-keys.

## Payment activation

First configure SUPPORT_EMAIL and review the published /privacy, /terms and /refunds pages. Set POLICIES_APPROVED=1 only after approval. Payment readiness additionally requires PAYMENTS_ENABLED=1 and configured provider credentials. A healthy enabled background worker is required for new paid jobs.

Stripe: STRIPE_SECRET_KEY (secret), initially a sandbox/test key. Hosted Stripe Checkout supports cards and automatically offers Apple Pay when eligible; verify on an actual supported device. References: https://docs.stripe.com/testing and https://stripe.com/payments/apple-pay.

PayPal: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (secrets), PAYPAL_ENV=sandbox for tests, live for launch. Orders are created server-side with the saved price, USD, export ID and manifest hash. Only a matching completed capture unlocks downloads. Captures and refunds use stable idempotency keys; the worker discovers approved/completed orders without a browser return. References: https://developer.paypal.com/api/rest/integration/orders-api and https://developer.paypal.com/api/rest/requests/.

Verify separately for both providers:
1. Prepare a 26-product package before opening checkout; quoted price is $9 USD. Direct unsigned/unpaid downloads must fail.
2. Complete a sandbox payment, close the return page, and let the worker discover it. Confirm package state stays ready without reprocessing images.
3. Return through the recovery link. Verify automatic single-ZIP download after the normal payment return. Repeated downloads require no additional payment.
4. Cancel checkout, reopen the existing session/order, and confirm only one provider can own an export's checkout. A cancelled checkout leaves the ready package available until expiry.
5. Retry after an interrupted checkout creation or payment confirmation without duplicate charge/capture. A wrong export/hash/currency/amount must never unlock files.
6. Test failure/partial results and two processing retries. No-success new exports require no payment. Legacy paid zero-image failures/cancellations and discovered late payments queue refunds. Refund status is reconciled and failed refunds require operator review.
7. Check one-hour download expiration (capped at package expiry), fresh renewal, 24-hour results expiration, and download rejection during refund review.
8. Verify mobile/desktop checkout, Apple Pay availability, automatic downloads and recovery with real browsers.

Fixture tests are not live payment proof. Enable live credentials only after sandbox verification and merchant account activation. No webhooks are required for this implementation: the unattended worker retrieves provider state. Monitor provider records and /api/ops; pause new paid jobs with PAYMENTS_ENABLED=0 if recovery fails.

## Public pilot and operations

Keep current owner-private access until explicit public-launch authorization. Confirm operator identity, a working support contact, final refund/review handling, approved policies, verified email delivery and real sandbox payments. Test anonymous access after changing sharing. Monitor worker heartbeat, failures, email counts, refund cases, budgets and Render run history. Default Render account failure notifications are configured; their delivery has not been independently verified.

The owner authorized storing the worker secret and private Sites access token in Render on October 7, 2026. The command runs only the isolated, base64-encoded worker/runner.py; the example Flask scaffold is not executed. Renew private access credentials when required. Updating runner.py requires updating that encoded Render command; server queue/concurrency changes do not.

## Verification limits

Consult docs/DEBUGGING-PHASES.md for current browser verification evidence; earlier unavailable-tool notes are historical. Unit/integration tests use real SQLite migrations and mocked R2/provider APIs. Actual email delivery, Stripe/PayPal sandbox payments, refunds and Apple Pay device behavior require configured accounts and browser verification. Live HTTP tests exercise real Shopify images, unattended Render processing, authenticated results and streamed ZIP downloads.

## SEO and mobile launch checks

Public marketing pages have unique titles/descriptions, HTTPS canonical URLs, Open Graph/Twitter previews and a 1200×630 share card. /csv-guide provides a server-rendered CSV reference linked from the main navigation. The homepage emits WebSite/WebApplication structured data without invented reviews or ratings. Results, API routes and file downloads carry noindex headers; results also have noindex/nosnippet metadata.

SEO_INDEXABLE defaults off. While private, robots.txt disallows crawling and sitemap.xml contains no URLs. After explicitly authorizing public access, set SEO_INDEXABLE=1 and redeploy. Only homepage, pricing, support and CSV guide enter the sitemap; policy pages additionally require POLICIES_APPROVED=1. PUBLIC_SITE_URL controls canonical/share/email links; update it if a custom domain is added. Submit the public sitemap in Google Search Console after ownership verification. Private authentication still prevents search engines from accessing the site, regardless of metadata. No rankings or indexing are guaranteed.

Mobile layouts cover narrow phones through tablets, with touch targets, 16px form controls, stacked options, wrapping results, scrolling CSV tables, a collapsible accessible navigation and reduced-motion support. Before public launch, verify on iOS Safari and Android Chrome at 320/360/390/768px, including landscape, 200% zoom, file picking, navigation, email keyboard, recovery links, payment return, signed downloads and the complete single ZIP. Supported browser automation remains unavailable here; source/build/HTTP checks do not establish visual device behavior or Core Web Vitals. Measure real Lighthouse/PageSpeed results once the site is publicly accessible.

## Information-page update — October 7, 2026

Public-facing draft notices and owner-setup text have been removed. Completed purchases have no discretionary refunds; billing-error corrections, failed-delivery reversals, and rights required by applicable law remain. The notice appears before checkout and is linked from terms, pricing, support, and the homepage FAQ. The support contact uses SUPPORT_EMAIL only; the owner selected a dedicated address but has not supplied it yet. The support page therefore offers complete troubleshooting and accurately reports email support as unavailable. Payments and public access remain disabled pending their existing launch checks.


## Payment recovery and operator cases — October 9, 2026

Checkout provider, exact creation payload and start time are saved before the provider call. An uncertain attempt cannot switch providers. The unattended worker replays the identical request with the original key only within conservative limits: 5 hours for PayPal and 23 hours for Stripe. Older unresolved creations stop for operator review rather than risk a second checkout. These limits are below the documented order-create idempotency retention of 6 hours for PayPal and at least 24 hours for Stripe:
- https://developer.paypal.com/sdk/orders/v2/orders-create/
- https://docs.stripe.com/api/idempotent_requests

Known checkout references continue to be reconciled after file deletion: every minute while available, hourly after expiry, and every five minutes on errors. Expired PayPal orders are queried without initiating capture. A payment first recorded after expiry or terminal failure/cancellation queues a refund; previously recorded successful purchases are not refunded simply because retention ends. Unknown checkout creation beyond the replay limit requires provider-side investigation; no automated second creation is allowed. Do not clear its ownership marker to retry.

GET /api/ops now alerts on unresolved billing cases, failed notifications and checkout creations requiring review. The existing runner exits nonzero when any alert is present, so no runner command update is required. Alert email delivery from Render remains a separate verification gate.

After resolving a billing or email case, authenticated POST /api/ops accepts {"id":"<export ID>","kind":"billing"} or {"id":"<export ID>","kind":"email"}. Use the same operator bearer authorization as GET (and private Site access header where applicable). This records acknowledgement only, never payment or refund approval. A new customer billing report reopens the case. Failed-email payloads are erased at expiry while minimal unresolved alert records remain. Checkout-review alerts cannot be dismissed through this endpoint: investigate the provider record before any manual repair.

Automated payment fixtures do not establish live provider acceptance. Sandbox payment, refund, email and browser release gates remain required.
