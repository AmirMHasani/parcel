# October 9 code-gap repair

- [x] Persist checkout ownership and exact payload before provider calls; recover uncertain attempts without switching providers.
- [x] Bound idempotent creation replay; escalate older unknown attempts for operator review.
- [x] Reconcile known checkout references after file expiry and queue refunds for newly discovered late payments.
- [x] Alert on unresolved customer billing cases, failed emails and uncertain checkout creations; add authenticated billing/email acknowledgement.
- [x] Correct current signed-download expiry documentation to one hour, capped by package expiry.
- [ ] Real provider sandbox, email delivery, browser/device and production-load acceptance remain open. See launch-runbook.md.

# Current status — three-phase maintenance, 2026-10-08 ET

See [DEBUGGING-PHASES.md](DEBUGGING-PHASES.md) for the current checklist and verification instructions. Historical entries below are retained as dated evidence, not current acceptance claims.

- Code work: byte/hash delivery checks, phase-aware UI, three-image quick demo, inline validation, observed progress estimates, recovery controls, support copy, and outcome-specific notification templates.
- Owner/browser gates: desktop/mobile saves and resume, fresh-profile recovery, domain/support details, policies and pricing approval, Stripe/Resend setup and authorized test recipient.
- Browser evidence: quick-sample ZIP saved in cloud Chrome, all four entries passed CRC, and SHA-256 matched a separate service GET. Tiny static save and in-page fetch/hash also passed.
- Still open: historical HTML failure root cause, hosted ZIP Content-Length behavior, interrupted resume, independent-profile recovery, and other-browser/mobile release validation. No paid/email/public launch is authorized by passing automated tests alone.

# Parcel: owner and Codex task list

Updated October 7, 2026. Site remains owner-private; payments remain disabled.

## Amir — account setup and business decisions

- [ ] Provide Stripe test credentials through runtime secret settings; activate the business account and provide live credentials after testing. Do not commit secrets.
- [ ] Provide PayPal sandbox credentials, then live credentials after verification. Confirm the receiving merchant account.
- [ ] Create/configure Resend and verify a sending domain through DNS. Supply RESEND_API_KEY, EMAIL_FROM and the intended PUBLIC_SITE_URL.
- [ ] Choose a monitored customer support email (SUPPORT_EMAIL) and the person responsible for billing/support requests.
- [ ] Review the completed Terms, Privacy and no-refund policy; confirm the business identity/contact details and policy approval before paid launch.
- [ ] Confirm the existing pricing: <=25 products free; 26–250 $9; 251–1,000 $19; >1,000 $39. The ten-product sample is free and intentionally does not open checkout. Request a pricing change if a different sample policy is intended.
- [ ] Authorize public access after the launch checks pass. Select a custom domain if desired.

## Codex — implemented in this change

- [x] Replace raw HTML-to-JSON parser failures with actionable session/service errors and retry controls; preserve saved jobs.
- [x] Send JSON Accept headers, same-origin credentials and no-store requests for the export workflow.
- [x] Remove the browser-only multipart fallback; keep one saved export workflow.
- [x] Build one resumable ZIP using bounded internal storage segments. Deliver exactly one customer file with one complete manifest.
- [x] Convert older multi-ZIP exports from saved images when Download is requested; do not refetch successful images or extend expiry.
- [x] Show one primary download action, feedback, and a direct-link fallback. Paid jobs require verified payment; free jobs download directly.
- [x] Preserve the job ID in results URLs and the key in the fragment; remember keys per job, including checkout returns and older links.
- [x] Add explicit empty/recovery states instead of an apparently blank results page.
- [x] Make optional email input editable and save requests encrypted. State clearly when delivery is not configured; never claim an email was sent.
- [x] Redesign progress, package details, return-link controls and the standalone results page for desktop/mobile layouts.
- [x] Update affected product/policy copy to describe one ZIP.
- [x] Run 58 automated tests: archive CRC/offsets across segments, checkpoint interruption, old-job conversion, email queuing, payment authorization and link recovery included. TypeScript passed.

## Codex — deployment and remaining verification

- [x] Build and deploy the implementation privately; record release and live test results below.
- [x] Run the full 50-image sample through the unattended worker; download one ZIP and verify every entry CRC and manifest mapping.
- [ ] Verify desktop/mobile browser clicks, email entry, direct download, and results recovery in a fresh browser. Browser QA tooling is unavailable in this session; API/tests do not prove visual behavior.
- [ ] Reproduce the intermittent HTML response with status/redirect evidence. Current live config/status endpoints return JSON; handling is fixed, but the original upstream/session cause is not yet proven.
- [ ] After owner supplies credentials: configure and test Resend delivery, retries, return-link recovery and expiry, using an explicitly approved recipient.
- [ ] After owner supplies credentials: test Stripe and PayPal checkout, cancellation, payment confirmation, automatic download, duplicate payment protection, and repeat downloads. Verify Apple Pay on an eligible device/account.
- [ ] Run a production-size archive/load test within agreed usage limits; validate restart behavior, two concurrent jobs, 24-hour access denial and cleanup.
- [ ] Enable payments only after provider tests, support contact and policy approval are complete.
- [ ] After public authorization: publish access, enable public SEO settings, verify indexing configuration and monitoring.

## Evidence and limitations

- Before changes: deployed v15, source 55f2893d26c2d107683288cfb0d55bf9be0f33ca.
- Live authenticated API probe: /api/config returned 200 JSON and background=true; payments/email=false. Missing-job status returned 404 JSON. /results returned 200 HTML as expected for a page.
- Screenshot: saved job at 50/50 images, 248.7 MB, raw HTML-to-JSON error; no job ID/key in screenshot, so this exact job cannot be identified from the attachment.
- No payment credentials or email sender were invented; public access and payment gates remain unchanged.

- Initial implementation deployed successfully October 7 at 5:44 PM ET, source 5983b134dbb800649b447e1a92335713217c8cbd. Final follow-up also denies downloads after failed packing.

- Live sample job dc36ab2d-7fb6-4f99-8e63-ce86d2f44e59: 50/50 images, zero failures, one ZIP (248,769,680 bytes), 50 manifest rows, all 51 entries passed CRC checks. Results route returned HTTP 200 with the new layout. Processing was driven by the existing scheduled worker; no manual tick calls. API/download verification does not establish browser click-through or mobile visual behavior.

## Follow-up repair — October 7, 2026

- [x] Share configuration refresh between homepage and saved-export panel. Retry updates worker/payment availability in both, including recovery after a failed initial request. Coalesce simultaneous requests.
- [x] Bound each status poll to 30 seconds so a hung request cannot stop polling indefinitely.
- [x] Record redacted HTML-response diagnostics (requested/final path, status, content type, redirect flag, request ID, timestamp). Exclude query strings, fragments, response bodies and recovery keys. Store only the most recent entry in sessionStorage as parcel-last-api-error.
- [x] Implement single byte ranges, suffix/open-ended ranges, 206/416, HEAD, ETag/If-Range and bounded R2 reads across internal ZIP segments.
- [x] Account download egress in <=8 MiB chunks (bounded to avoid per-request subrequest exhaustion on 1 GB archives) handed to the response stream. Interrupted transfers no longer charge the entire ZIP. This measures server-emitted bytes, not confirmed bytes on a customer's disk; a disconnect can charge one in-flight chunk.
- [x] Remove obsolete browser-only export instructions and multipart checkout wording.
- [ ] Original reported HTML failure: no captured failing user request/redirect chain exists. Correctly authenticated fresh config probe returned 200 JSON with a healthy worker; unauthenticated probe returned edge 403 JSON, Cloudflare 1010. This does not prove the cause of the earlier user's HTML response. New diagnostics support the next occurrence.
- [ ] Browser/device verification: supported control-browser skill unavailable; desktop/mobile interaction testing remains unverified.
- [ ] Email wording/activation and all payment/provider testing explicitly deferred by Amir for this session.

Download authorization remains checked for every range request. New signed URLs last up to one hour, capped at package expiry; after expiry, request a new link from the results page. Byte ranges support compatible download clients; automatic cross-URL resume in every browser is not claimed.


## Phase 1 verification update — 2026-10-08 21:10 ET

- Fixed and deployed homepage Start a new export reset; confirmed selecting a fresh sample and recovering the previous export.
- Large Chrome ZIP save passed: 248,769,680 bytes, 51 valid entries, SHA-256 matched a separate service download.
- Real HTTP interruption and same-link range resume after 125 seconds passed with exact full-file hash.
- 79 tests, TypeScript and production build passed.
- Remaining acceptance: browser-manager interruption/resume, Firefox/mobile and independent profile. Historical HTML failure not reproduced; hosted GET Content-Length rewriting not isolated. See DEBUGGING-PHASES.md for dated evidence and limits.


## Phase 2 update — 2026-10-08 21:54 ET

- Deployed simpler preparation without an inactive email field, clear missing/expired recovery states, terminal-error polling control, and more readable return-link/navigation controls.
- 79 tests, TypeScript, and production build passed.
- File-picker test and subsequent browser status check timed out. Resume visual, keyboard, same-file selection and mobile acceptance when browser access works; do not treat these checks as completed.
