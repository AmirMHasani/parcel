# Parcel — Shopify Product Image Exporter

Upload a Shopify CSV, configure filenames and create ZIPs with original image bytes and manifests. The customer interface uses saved background exports only. Saved background exports use D1 for job state and R2 for images and ZIP parts.

## Hosting and deployment (Cloudflare Workers)

Parcel runs on the owner's Cloudflare account as one Worker named `parcel` (configured in `wrangler.jsonc`) with a D1 database (`parcel-db`, binding `DB`) for job state and an R2 bucket (`parcel-exports`, binding `BUCKET`) for images and ZIP parts. GitHub (`AmirMHasani/parcel`) is the source of truth and `main` is the only branch; it always matches the live site. Pull before you start, and deploy only from an up-to-date `main` (a deploy replaces the whole live site). Pushing to GitHub does not deploy by itself. Earlier versions ran on ChatGPT Sites with an external Render runner; that hosting is retired (see docs/DEBUGGING-PHASES.md for the historical record).

Deploy from a clean checkout:

1. `pnpm install --frozen-lockfile`
2. `pnpm test && pnpm typecheck`
3. `pnpm db:migrate:remote` (applies any new `drizzle/*.sql` migrations to D1)
4. `pnpm deploy` (builds with vinext and runs `wrangler deploy`)

Wrangler needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment (or `wrangler login`). Non-secret settings live in `wrangler.jsonc` `vars` and are re-applied on every deploy. Secrets are set once with `wrangler secret put NAME` and are never committed: `PARCEL_WORKER_SECRET`, `EXPORT_SIGNING_SECRET`, `STRIPE_SECRET_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, optional `RESEND_API_KEY`, and the pre-launch gate `SITE_ACCESS_PASSWORD`.

Local development: put the same secret names in an untracked `.dev.vars`, run `pnpm db:migrate:local`, then `pnpm dev`. Trigger the scheduler locally with `curl http://localhost:5173/cdn-cgi/handler/scheduled`.

### Pre-launch privacy gate

While `SITE_ACCESS_PASSWORD` is set, every page shows a simple password page (a cookie remembers the browser for 30 days; HTTP Basic credentials with any username also work for scripts). Operator endpoints (`/api/worker/tick`, `/api/ops`) keep their own bearer authorization. Pages are also marked noindex while the gate is on. Delete the secret (`wrangler secret delete SITE_ACCESS_PASSWORD`) only after public launch is approved.

## Background processing

A Cloudflare Cron Trigger fires every minute. `worker/index.ts` `scheduled()` sends authorized POSTs to `/api/worker/tick` through the `SELF` service binding, so each tick runs as its own invocation with its own CPU, memory and subrequest budget, and keeps ticking for up to 50 seconds while work remains. It then reads `/api/ops`; any operator alert marks the scheduled run as failed in the Cloudflare dashboard and Workers logs. BACKGROUND_EXPORTS=1 enables new exports, and the UI additionally requires a worker heartbeat within three minutes. EXPORT_SIGNING_SECRET is required for signed downloads and encrypted notification requests.

Up to MAX_CONCURRENT_JOBS exports (default 10, set in `wrangler.jsonc` vars) are processed at once across the service; the worker lease in lib/job-worker.ts enforces it. The scheduler runs MAX_CONCURRENT_JOBS / TICKS_PER_CALL parallel lanes, and each worker HTTP invocation runs TICKS_PER_CALL (at most two) leased ticks concurrently. Each tick processes one image or internal ZIP segment; packing streams from storage and runs alongside downloads, with at most MAX_CONCURRENT_PACKING (default 2) exports packing at once. Every tick started from one scheduler run shares Cloudflare's limit of six connections waiting for a response, so the tick endpoint sends its headers immediately and the result follows in the body. Jobs rotate by next_run for fair scheduling, so when more exports are active than the limit they take turns. The status endpoint returns queue position, estimated start and estimated completion, which the export page shows while a job waits. Saved images and result rows survive runner restarts. Expired leases are reclaimable, counters reconcile after interrupted commits, and saved images are reused. The browser never drives the job. Recovery links contain a secret capability: anyone with that link can access the job. Keep them private. Local storage remembers the most recent export.

## Protections and limits

- Only HTTPS cdn.shopify.com, validated at every redirect (maximum three).
- Maximum 20 MB/image, 20-second fetch timeout, 10 MB CSV, 10,000 images and 2 MB API metadata.
- Background jobs: 300 MB free or 1 GB paid, five creations/client/day, two active/client and MAX_ACTIVE_EXPORTS active globally (default 30; new exports beyond it get a 429 "queue is full"). Clients are keyed by a salted hash of their IP address; shared networks share limits.
- Download bandwidth reservations: 5 GB globally/day, 1 GB/client/day by default. Configure GLOBAL_DAILY_BYTES and CLIENT_DAILY_BYTES. Interrupted reservations conservatively remain counted until the daily reset.
- Stored ZIP downloads: 120/client/hour and 3 GB/client/day. API and authorization requests have additional rate limits. Requests return 429 when exceeded.
- Background packing persists bounded internal segments of one standard ZIP, with up to 20 MB of image bytes per tick. The download endpoint streams the segments in order as a single file. Completed files expire after 24 hours from package readiness, with a separate 24-hour processing deadline. Cleanup runs through the worker and may occur later if it is offline. Access is denied at expiry regardless of cleanup.
- Browser-only multipart fallback has been removed from the customer interface. If the worker is offline, new exports wait for service availability.

## Payments and failure recovery

Checkout and payment verification bind the session to the saved job, manifest hash, expected amount and USD currency. A runner retrieves Stripe session state, so payment recovery does not require the browser to return. Stripe calls use idempotency keys. Never enable paid exports before real Stripe test-mode verification.

Transient failures retry automatically. Partial/failed exports support two user retries, reusing successful images. Paid failures or cancellation with zero successful images queue a full refund. Refund status is checked until successful or flagged for review. Partial paid exports offer a recorded review request; these do not automatically refund. An optional Resend ready email is wired through an encrypted durable outbox, but provider credentials are not configured.

## Operations

GET /api/ops with Authorization: Bearer PARCEL_WORKER_SECRET returns worker heartbeat, job counts, recent errors, refund/review cases and global usage. Check heartbeat age, failed jobs, pending refunds and review cases. Error events also emit structured Worker logs. Watch failed Cron events in the Cloudflare dashboard (Workers → parcel → Settings → Triggers / Logs); an operator must review recorded cases. Error details are truncated and URLs redacted. Events expire after seven days when cleanup runs; job metadata is retained for payment/support reconciliation. No automated metadata deletion is configured.

## Verification

Run `pnpm test`, `pnpm typecheck` and `pnpm build`; GitHub Actions runs the same three checks on every push to main and every pull request (.github/workflows/ci.yml). Tests exercise real SQLite migrations with mocked object storage and Stripe: quota atomicity, capability isolation, worker restart, interrupted writes, partial retries, expiry, refunds, CSV compatibility and ZIP integrity. These are not a substitute for live Stripe or browser click-through tests.

The site offers one sample, public/sample-quick.csv (three public product images on Shopify's CDN), which stays within the free tier so visitors never hit checkout while trying Parcel. public/sample-shopify-products.csv (ten products, fifty image URLs, collected October 7, 2026) is kept unlinked for operator load testing only. Both list the products under a made-up brand, Fernhollow, with fictional titles, handles and SKUs; the image URLs are unchanged and were re-checked on October 10, 2026 (all fifty returned HTTP 200). Five flip-flop image URLs in the operator file still contain the original merchant's name in their filenames, which cannot be changed without breaking them; the quick sample avoids them. The homepage includes the CSV format guide. Legacy and current Shopify headers are accepted. Earlier HTTP testing downloaded all fifty images and validated ZIP CRCs; image URLs may change.

## Production hardening (October 7, 2026)

Payment activation now requires PAYMENTS_ENABLED=1 in addition to Stripe credentials and worker health. Leave this at 0 until actual test-mode checkout, cancellation and refund verification pass. Concurrent job actions share the worker lease; retry cleanup and its state transition commit atomically. Idempotent creation survives client IP changes, and expired attempts cannot be reused. Global ZIP egress is capped at 5 GB/day (GLOBAL_DAILY_EGRESS); persisted errors are capped at 1,000/day.

The scheduler refuses HTTP redirects and requires JSON responses. It checks operator metrics after each run and fails the scheduled run for stalled processing, refund review or delayed refunds, making those failures visible in the Cloudflare dashboard. Transactional ready notifications are sent only when Resend is configured and a user enters an address.

Launch scope: paid commercial launch remains blocked on real Stripe/PayPal sandbox tests, an operator support contact and refund review procedure, and owner-approved public access. Do not describe a password-gated deployment as a public commercial launch.

## Agency subscription plan (branch `agency`, not yet released)

A $49/month subscription for migration agencies: 50 exports per billing month, 1 GB per export, priority in the worker
queue, client-named ZIPs. Invite-only beta. Everything is behind `AGENCY_ENABLED` (production `0`, staging `1`) and ships
to production once, as a single release, after the checklist in `docs/agency-verification.md` passes on staging.
Operator steps: `docs/agency-runbook.md`. Code: `lib/agency*.ts`, `lib/zip-name.mjs`, `app/api/agency/*`,
`app/agency/*`, `components/Agency*.tsx`; migration `drizzle/0005_agency_plan.sql` (additive). Stripe Checkout runs in
subscription mode; status is read from Stripe (10-minute cache, daily sweep); there is no webhook endpoint in the beta.

## Customer pages and remaining launch work

/pricing, /support, /privacy, /terms and /refunds are available. Information pages are complete with a no-refund policy for completed purchases. A dedicated support contact and the existing launch checks remain required. Configure SUPPORT_EMAIL and POLICIES_APPROVED=1 before enabling paid exports. Payment readiness requires PAYMENTS_ENABLED=1, POLICIES_APPROVED=1, a valid SUPPORT_EMAIL and Stripe or PayPal credentials, plus a healthy background runner for new jobs. Successful refunds are rechecked for seven days so later failure is surfaced to the operator. See docs/launch-runbook.md for the test plan and owner-dependent gates.

## Ready email and pay on download

/results opens a private recovery link with a 24-hour window starting when results are ready. Processing happens before checkout. A server-verified Stripe payment or PayPal completed capture unlocks the complete ZIP. Stripe hosted Checkout offers Apple Pay on eligible devices. Short-lived signed download links expire after one hour, capped at package expiry and can be renewed without a new payment. Browser redirects never prove payment. Recovery keys are kept out of URL query parameters and optional email outbox data is encrypted at rest.

Email configuration: RESEND_API_KEY, EMAIL_FROM from a verified domain, PUBLIC_SITE_URL. PayPal configuration: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV=sandbox or live. Missing credentials keep the relevant UI unavailable. See docs/launch-runbook.md for activation and actual provider verification. Fixtures verify payment binding, concurrent processing, email idempotency, retention and expiring links; they do not prove live email delivery or payment processing.
