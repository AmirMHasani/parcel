# Parcel — Shopify Product Image Exporter

Upload a Shopify CSV, configure filenames and create ZIPs with original image bytes and manifests. The customer interface uses saved background exports only. Saved background exports use D1 for job state and R2 for images and ZIP parts.

## Background processing and launch gate

`worker/runner.py` is a dependency-free Python runner. Schedule `python worker/runner.py` once per minute on an independent host. Set PARCEL_SITE_URL and PARCEL_WORKER_SECRET; owner-private Sites also require PARCEL_SITE_ACCESS_TOKEN. Keep credentials in host secrets, never source control. Renew private-site access credentials when required. A failed runner invocation exits nonzero for host monitoring.

Configure the same PARCEL_WORKER_SECRET in Sites. Set BACKGROUND_EXPORTS=1 only after the scheduled runner is connected. The UI additionally requires a heartbeat within three minutes. Stripe Checkout requires STRIPE_SECRET_KEY and a healthy enabled background runner. EXPORT_SIGNING_SECRET is required for signed downloads and encrypted notification requests. Environment changes require deployment.

Each worker HTTP invocation runs two leased ticks concurrently. Each tick processes one image or internal ZIP segment; ZIP packing runs exclusively. Jobs rotate by next_run for fair scheduling. Saved images and result rows survive runner restarts. Expired leases are reclaimable, counters reconcile after interrupted commits, and saved images are reused. The browser never drives the job. Recovery links contain a secret capability: anyone with that link can access the job. Keep them private. Local storage remembers the most recent export.

Background processing is enabled with the Render runner parcel-export-runner (crn-db32evrtqb8s73dup0mg), running once per minute in Virginia. Sites stores job state and files; Render independently drives processing. A scheduled run completed a four-image real Allbirds export without local worker calls on October 7, 2026.

## Protections and limits

- Only HTTPS cdn.shopify.com, validated at every redirect (maximum three).
- Maximum 20 MB/image, 20-second fetch timeout, 10 MB CSV, 10,000 images and 2 MB API metadata.
- Background jobs: 300 MB free or 1 GB paid, five creations/client/day, two active/client and ten active globally. Clients are keyed by a salted hash of their IP address; shared networks share limits.
- Download bandwidth reservations: 5 GB globally/day, 1 GB/client/day by default. Configure GLOBAL_DAILY_BYTES and CLIENT_DAILY_BYTES. Interrupted reservations conservatively remain counted until the daily reset.
- Stored ZIP downloads: 120/client/hour and 3 GB/client/day. API and authorization requests have additional rate limits. Requests return 429 when exceeded.
- Background packing persists bounded internal segments of one standard ZIP, with up to 20 MB of image bytes per tick. The download endpoint streams the segments in order as a single file. Completed files expire after 24 hours from package readiness, with a separate 24-hour processing deadline. Cleanup runs through the worker and may occur later if it is offline. Access is denied at expiry regardless of cleanup.
- Browser-only multipart fallback has been removed from the customer interface. If the worker is offline, new exports wait for service availability.

## Payments and failure recovery

Checkout and payment verification bind the session to the saved job, manifest hash, expected amount and USD currency. A runner retrieves Stripe session state, so payment recovery does not require the browser to return. Stripe calls use idempotency keys. Never enable paid exports before real Stripe test-mode verification.

Transient failures retry automatically. Partial/failed exports support two user retries, reusing successful images. Paid failures or cancellation with zero successful images queue a full refund. Refund status is checked until successful or flagged for review. Partial paid exports offer a recorded review request; these do not automatically refund. An optional Resend ready email is wired through an encrypted durable outbox, but provider credentials are not configured.

## Operations

GET /api/ops with Authorization: Bearer PARCEL_WORKER_SECRET returns worker heartbeat, job counts, recent errors, refund/review cases and global usage. Private sites additionally require their Sites access header. Check heartbeat age, failed jobs, pending refunds and review cases. Error events also emit structured Worker logs. Configure independent host alerts for runner failures; an operator must review recorded cases. Error details are truncated and URLs redacted. Events expire after seven days when cleanup runs; job metadata is retained for payment/support reconciliation. No automated metadata deletion is configured.

## Verification

Run `node --test tests/*.test.mjs`, `npx tsc --noEmit` and the Sites build helper. Tests exercise real SQLite migrations with mocked object storage and Stripe: quota atomicity, capability isolation, worker restart, interrupted writes, partial retries, expiry, refunds, CSV compatibility and ZIP integrity. These are not a substitute for live Stripe or browser click-through tests.

The public sample contains ten actual Allbirds storefront products and fifty image URLs collected October 7, 2026. The homepage includes the CSV format guide. Legacy and current Shopify headers are accepted. Earlier HTTP testing downloaded all fifty images and validated ZIP CRCs; image URLs may change.

## Production hardening (October 7, 2026)

Payment activation now requires PAYMENTS_ENABLED=1 in addition to Stripe credentials and worker health. Leave this at 0 until actual test-mode checkout, cancellation and refund verification pass. Concurrent job actions share the worker lease; retry cleanup and its state transition commit atomically. Idempotent creation survives client IP changes, and expired attempts cannot be reused. Global ZIP egress is capped at 5 GB/day (GLOBAL_DAILY_EGRESS); persisted errors are capped at 1,000/day.

The runner refuses HTTP redirects to prevent forwarding credentials to a sign-in or unrelated host. It checks operator metrics after each run and exits nonzero for stalled processing, refund review or delayed refunds, making those failures visible in Render run history. Configure Render account notification delivery and monitor run history; Transactional ready notifications are sent only when Resend is configured and a user enters an address.

The prepared Render runner configuration uses Render's official Flask example solely as a Python runtime scaffold, with a no-op build and automatic deploys disabled. Parcel's exact runner source is supplied as the isolated Python start command, and is version-controlled here. The example application and its dependencies are not run. After editing runner.py, update the Render start command to the newly encoded source. Site credentials are stored only in Render environment secrets. Private Sites access credentials must remain valid; any access failure causes a failed run and the background UI becomes unavailable after three minutes.

Launch scope: free background exports can be enabled after successful unattended verification. Paid commercial launch remains blocked on real Stripe credentials/tests, an operator support contact and refund review procedure, and user-approved public access. Browser click-through remains unverified in this environment. Do not describe the current owner-private deployment as a public commercial launch.

Credential storage in Render was explicitly approved by the owner on October 7, 2026. Render is deployed and BACKGROUND_EXPORTS=1. Paid exports remain disabled.

## Customer pages and remaining launch work

/pricing, /support, /privacy, /terms and /refunds are available. Information pages are complete with a no-refund policy for completed purchases. A dedicated support contact and the existing launch checks remain required. Configure SUPPORT_EMAIL and POLICIES_APPROVED=1 before enabling paid exports. Payment readiness requires PAYMENTS_ENABLED=1, POLICIES_APPROVED=1, a valid SUPPORT_EMAIL and Stripe or PayPal credentials, plus a healthy background runner for new jobs. Successful refunds are rechecked for seven days so later failure is surfaced to the operator. See docs/launch-runbook.md for the test plan and owner-dependent gates.

## Ready email and pay on download

/results opens a private recovery link with a 24-hour window starting when results are ready. Processing happens before checkout. A server-verified Stripe payment or PayPal completed capture unlocks the complete ZIP. Stripe hosted Checkout offers Apple Pay on eligible devices. Short-lived signed download links expire after one hour, capped at package expiry and can be renewed without a new payment. Browser redirects never prove payment. Recovery keys are kept out of URL query parameters and optional email outbox data is encrypted at rest.

Email configuration: RESEND_API_KEY, EMAIL_FROM from a verified domain, PUBLIC_SITE_URL. PayPal configuration: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV=sandbox or live. Missing credentials keep the relevant UI unavailable. See docs/launch-runbook.md for activation and actual provider verification. Fixtures verify payment binding, concurrent processing, email idempotency, retention and expiring links; they do not prove live email delivery or payment processing.
