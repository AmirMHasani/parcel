# Parcel — remaining work and launch checklist

Updated: October 9, 2026 (America/New_York).
Reviewed baseline: GitHub `6aa20c8`, imported from Sites source `37da912`.

**Hosting decision (October 9, 2026):** Amir chose to move Parcel off ChatGPT Sites to his own Cloudflare account (Workers + D1 + R2), with Cloudflare Cron replacing the Render runner, a custom domain, and both Stripe and PayPal at launch. The port keeps all 89 automated tests passing and was verified locally end to end (real Shopify images → valid ZIP). Item references below to Sites runtime secrets now mean `wrangler secret put`, and references to Render now mean the Cloudflare Cron Trigger.

This is the current prioritized checklist. Use the dated records in [DEBUGGING-PHASES.md](docs/DEBUGGING-PHASES.md) for historical evidence and [launch-runbook.md](docs/launch-runbook.md) for operating instructions. Older unchecked items in [OWNER-AND-CODEX-TODO.md](docs/OWNER-AND-CODEX-TODO.md) may have been superseded.

## Status and scope

**Not yet accepted for paid public launch.** The latest recorded configuration is owner-private, background processing enabled, payments disabled, and payment/email credentials unconfigured. Runtime secrets and external accounts were not rechecked for this documentation update.

The October 9 repair record reports 89 passing automated tests and a passing TypeScript check. Tests were not rerun for this documentation-only update; mocked-provider tests do not prove actual payment or email delivery.

Already implemented: one ZIP per export, unattended processing, saved results and private recovery links, range downloads, one-hour signed download URLs capped by package expiry, payment authorization, durable checkout recovery, late-payment refund handling, notification templates, and operator alerts.

Recorded live evidence: a 248,769,680-byte ZIP saved in cloud Chrome with all 51 entries valid and a matching independent SHA-256; a separate interrupted HTTP transfer resumed after 125 seconds with an exact reconstructed hash. Browser download-manager resume, other browsers/devices, and independent-profile recovery remain unverified.

## Launch status — October 9, 2026

- Public at https://parcelexport.com on Cloudflare Workers Paid (Worker `parcel`, D1 `parcel-db`, R2 `parcel-exports`); email DNS for support@parcelexport.com (Hostinger mail) lives in the Cloudflare zone.
- Operator: Lumen Collectives LLC. Owner approved Terms, Privacy, pricing and the no-refund policy (POLICIES_APPROVED=1, SUPPORT_EMAIL set).
- Sandbox acceptance on the password-gated staging Worker `parcel-staging`: PayPal sandbox order captured once for $9.00 and the export unlocked from server-side discovery; Stripe test-mode Checkout (Parcel account) paid $9.00 and the export unlocked. No billing alerts.
- Live: Stripe restricted live key installed, PAYMENTS_ENABLED=1. A live Checkout session was created from production for a 26-product export, then expired unpaid. PayPal stays hidden until live credentials are supplied (PAYPAL_ENV=live).
- Still open: PayPal live credentials; optional real-card purchase + dashboard refund by the owner; C5–C9 device/capacity/operations acceptance; Google Search Console verification.

## P0 — complete before charging customers

### Amir: accounts and business decisions

- [ ] **A1 — Support and policies.** Supply a monitored support email and business/contact details. Approve Terms, Privacy, pricing, and refund exceptions. Set `SUPPORT_EMAIL` and only then `POLICIES_APPROVED=1`. Current pricing: up to 25 products free; 26–250 $9; 251–1,000 $19; above 1,000 $39.
- [ ] **A2 — Payment accounts.** Supply Stripe test credentials and PayPal sandbox credentials through runtime secrets. Confirm merchant accounts; use live credentials only after sandbox acceptance.
- [ ] **A3 — Email setup.** Select/verify the Resend sending domain, configure DNS, and supply `RESEND_API_KEY`, `EMAIL_FROM`, and the intended `PUBLIC_SITE_URL`. Explicitly authorize a test recipient before any email is sent.
- [ ] **A4 — Test resources.** Provide access to representative desktop/mobile browsers and approve a bounded live load-test budget. Choose an operator to handle billing, failed refunds, and failed notifications.

### Codex: provider and delivery acceptance, after A1–A4

- [ ] **C1 — Stripe sandbox E2E.** Prepare a paid package; verify the saved price, successful checkout, cancellation/reopening, confirmation without browser return, automatic ZIP download on normal return, and repeat downloads without another charge. Verify unpaid/tampered requests cannot unlock files.
- [ ] **C2 — PayPal sandbox E2E.** Repeat C1; confirm one capture per export, correct amount/currency/export binding, and no new capture after package expiry.
- [ ] **C3 — Recovery and refunds with providers.** Exercise interrupted checkout creation and confirmation, provider ownership, stale uncertain attempts requiring review, late settlement after expiry, refund success/failure, and download denial during refund review. Record provider references privately; do not place customer or credential data in this public repository.
- [ ] **C4 — Resend E2E.** Verify accepted messages actually arrive, complete/partial/failed messages are correct, recovery works after closing the original tab, retries use the same payload without duplicate notification, and expired jobs do not send. Verify an email link in an independent browser session. Keep provider acceptance distinct from inbox delivery.
- [ ] **C5 — Browser download acceptance.** Test Chrome and Firefox on desktop, iOS Safari, and Android Chrome. Save one ZIP, extract it, verify entries/manifest/hash, and test download-manager interruption/resume where supported. Test expired signed links and fresh-link renewal; do not assume a fresh URL resumes an existing browser download.
- [ ] **C6 — Recovery and usability.** Test valid/invalid CSV file selection, same-file reselection, start-new-export, keyboard navigation, optional email validation when enabled, closing/reopening the page, and private-link recovery in an independent profile. Verify incomplete links, incorrect keys, missing exports, and expired exports show actionable errors.
- [ ] **C7 — Responsive acceptance.** Verify 320/360/390/768px layouts, landscape, 200% zoom, touch targets, navigation, progress, results, checkout return, and downloads. Record actual device/browser versions.
- [ ] **C8 — Capacity and lifecycle.** Within the approved budget, test representative archives toward the 300 MB free / 1 GB paid limits, two simultaneous exports, queued jobs, packing exclusivity, worker interruption/restart, quota exhaustion, 24-hour access denial, and eventual storage cleanup. Record duration, errors, and usage. Existing small/live samples are not full capacity proof.
- [ ] **C9 — Operations acceptance.** Confirm worker heartbeat and Render scheduling, migration 0003 availability, alert propagation to the operator, and receipt of Render failure notifications. Exercise billing/email acknowledgement and document safe escalation for unresolved checkout creation. Verify disabling new payments preserves access for already-paid customers.

Acceptance evidence for every C item: date, source/deployed version, environment/provider mode, expected versus actual result, and a redacted evidence reference. Mark passed only after observing the result.

## P1 — engineering and documentation follow-up

- [x] **C10 — Add GitHub CI.** Added `.github/workflows/ci.yml` (install, tests, TypeScript check, build) on October 9, 2026; mark accepted after the first green run. No tracked GitHub Actions workflow exists in the reviewed snapshot. Add a clean-checkout dependency install, automated tests, TypeScript check, and production build using compatible Node/pnpm versions. Demonstrate one successful GitHub run; do not depend on local Sites credentials.
- [ ] **C11 — Reconcile outdated documentation.** The launch runbook still says email entry is available while delivery is unconfigured; the current UI hides it and asks users to save a private return link. Update that section and superseded browser-tool/verification notes. Preserve historical evidence as dated records.
- [x] **C12 — Establish source/deployment ownership.** Resolved October 9, 2026: GitHub owns the source; deploys go to Cloudflare with `pnpm deploy` (README → Hosting and deployment). Original note: GitHub currently contains a source snapshot, not the prior Sites commit history. Document which repository owns future edits and how GitHub changes reach Sites and the separately scheduled Render runner. Do not imply GitHub pushes automatically deploy either service.
- [x] **C13 — Repository hygiene.** `tsconfig.tsbuildinfo` untracked and ignored; `.dev.vars` ignored. Original note: Stop tracking generated `tsconfig.tsbuildinfo` and add it to `.gitignore`. Keep runtime secrets, private recovery links, customer exports, and provider records out of commits.
- [ ] **C14 — Release and recovery procedure.** Record the exact tested source/version, migration compatibility, runtime configuration names, runner version, rollback steps, and responsible operator. Re-run affected checks after any repair discovered during acceptance.

## Open investigations — not confirmed current defects

- [ ] **I1 — Historical HTML instead of JSON.** The original failure's upstream cause remains unknown. Handling and redacted diagnostics are implemented. If it recurs, capture status, content type, requested/final path, redirect chain, and request ID; identify the responsible layer and add a regression for the reproduced cause. Never capture recovery keys or full response bodies containing private data.
- [ ] **I2 — Hosted Content-Length rewriting.** Hosted GETs were observed without Content-Length despite Worker framing changes. Exact full delivery and HTTP range resume have passed, so this is currently a non-blocking investigation. Identify the intermediary only if practical; change streaming code only for a reproduced compatibility defect.

There is no evidence from this review to label the application bug-free. Unverified acceptance items are not automatically confirmed bugs.

## Final public-launch sequence

- [ ] **Amir + Codex:** Close the applicable P0 gates and review remaining risks. If deferring a provider or email, explicitly narrow the launch scope and remove claims/controls for that unverified capability.
- [ ] **Amir:** Approve public access and live charging; choose a custom domain if desired. Domain purchase is a separate spending decision.
- [ ] **Codex:** Apply verified live configuration and deployment; then enable the approved public audience and test anonymous CSV upload, results recovery, and payment gating. Private-session evidence does not prove anonymous access.
- [ ] **Codex:** Set `SEO_INDEXABLE=1` only after public authorization; verify canonical/share/email URLs, robots, sitemap, and continued noindex for results/API/downloads. Submit the sitemap after owner verification of Search Console.
- [ ] **Amir + Codex:** Observe a bounded pilot, monitor failures, billing/refunds, email, queue latency, storage/egress and costs, and confirm the operator can pause new paid exports promptly.

## Recommended next action

Start C10–C13 while Amir completes A1–A4. Then run C1–C9 against configured test services and real browsers, fix any reproduced failures, and execute the launch sequence only after acceptance.
