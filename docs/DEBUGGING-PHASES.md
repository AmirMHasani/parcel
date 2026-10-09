# Parcel debugging plan

Updated 2026-10-08 21:10 (America/New_York).

Current Phase 1 status: confirmed application fixes deployed and available automated/live checks passed. Full acceptance remains open for independent-profile, Firefox/mobile, and browser download-manager interruption/resume. Historical entries below are dated evidence, not the current status.

## Phase 1 — Export reliability

Scope: JSON/API failures, file delivery, interrupted transfers, and saved-job recovery.

Implemented:
- Read the first bounded ZIP chunk and reserve its quota before committing HTTP 200/206. Missing storage returns JSON 503; exhausted quota returns HTTP 429 with Retry-After.
- Record midstream failures with job ID, transfer ID, requested range, delivered bytes, and status. Do not record signed URLs, access keys, or email addresses. Successful transfers expose X-Parcel-Transfer-Id.
- Refund both quota reservations for a chunk cancelled before enqueue. Continue charging chunks already handed to the response, not the whole archive. Network receipt cannot be measured exactly by the Worker.
- HEAD preflight in the UI checks session/access and content type before handing a URL to the browser download manager. It does not download or charge the ZIP. A preflight cannot guarantee a later GET succeeds.

Evidence before repair (v19):
- Exact 50-image visual-test job downloaded through authenticated service access: HTTP 200, 248,772,320 bytes, application/zip, 51 entries including manifest.csv, all CRCs passed.
- Sample CSV: authenticated HTTP 200, text/csv, 9,666 bytes.
- Config: authenticated HTTP 200; unauthenticated HTTP 403 JSON, no redirect. This does not reproduce or diagnose the historical HTML response.
- Browser clicks failed for both ZIP paths and sample CSV in the cloud browser. Service-access success does not prove browser-session success.
- New-tab/reload recovery worked during the visual test. Independent fresh-browser recovery remains unproven.

Acceptance remaining:
- Chrome cloud browser: saved and verified both quick and 50-image ZIPs. Firefox/mobile verification remains open.
- Capture status and redirect chain if the historical HTML response recurs; do not attribute it to authentication without that evidence.
- Exercise recovery in an independent browser profile.
- Verify interrupted network transfer/resume in an actual browser. Automated route tests cover cancellation, ranges, segment boundaries, and CRCs.
- New signed download URLs last up to one hour, capped at package expiry; later resume requires clicking Download ZIP for a fresh URL. Existing two-minute links must be renewed once. The private results link lasts until package expiry.

## Phase 2 — Workflow and UX

- Phase-accurate headings, including the results-page title.
- Bring each active step into view and reduce repeated introductory content.
- Small quick demo; retain large sample as a separate option.
- Measured progress estimates and separate download/packing stages.
- Inline email validation without unrelated connection-retry controls.
- Simpler recovery controls and clearer image-details spreadsheet wording.
- Finish obsolete browser-only support/runbook cleanup.
- Desktop/mobile visual regression and keyboard checks.

## Phase 3 — Payments, email, and launch

- Domain selection/purchase needs owner choice and spending authorization.
- Configure Stripe securely; verify test checkout, return, cancellation, and payment confirmation before live charging.
- Verify domain with Resend; configure sender and support destination.
- Implement distinct complete, partial, and failed notifications before enabling email.
- Test email delivery with an explicitly authorized recipient.
- End-to-end paid download, independent-session recovery, mobile checks, and launch gates.
- Preserve private visibility until public launch is expressly authorized.

### Follow-up download code review — 2026-10-07 21:24 ET

- Payment ruled out for the 10-product sample. Native browser requests reached download authorization, HEAD, and GET with HTTP 200; no recorded Worker stream error. File saving still failed in the cloud browser.
- Confirmed runtime mismatch: on v20, HEAD for bytes 0–1023 returned Content-Length: 1024, but GET returned no Content-Length and Transfer-Encoding: chunked despite the route setting the header. Cloudflare ignores manually supplied Content-Length for ordinary ReadableStream bodies (https://developers.cloudflare.com/workers/runtime-apis/response/).
- Fixed ZIP response framing using Cloudflare FixedLengthStream. It preserves the full/range length and rejects incomplete output while retaining bounded streaming. Added no-transform to discourage intermediary body modification.
- Added a native Workers-runtime regression covering full and range response lengths and truncated output; Node mocks alone did not catch the runtime behavior.
- Fixed a separate error-display defect: successful status polling cleared download/action errors after five seconds. Connection and action errors now have separate state; connection recovery cannot erase a download failure.
- These are confirmed code defects. The framing mismatch is a compatibility suspect, not yet proven to be the cloud-browser failure's root cause. Do not mark browser delivery passed without obtaining the file.

### Controlled browser isolation — 2026-10-07 21:46 ET

Research:
- HTTP/1.1 chunked responses are valid; Content-Length is not required for these transfers. Range requests and chunking are compatible (https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests).
- Browser-generated Blob URLs are a supported download source and require no server request (https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob).
- Chrome distinguishes file, network, and server download errors. The available cloud browser API exposes only a generic failure, not the interrupt reason (https://developer.chrome.com/docs/extensions/reference/api/downloads).

Controlled experiment deployed briefly as /download-check, then removed from production:
1. Create Blob(['Parcel download test\\n']) entirely in the browser; show a persistent blob URL link; click it directly with the mouse. The 21-byte download failed immediately with generic download failure ID bec76b35-fa05-4a1d-bc94-4fdbbb2b6b7f. No Parcel download endpoint, payment, signed URL, ZIP, streaming, or network was involved.
2. Fetch sample-shopify-products.csv in the page: completed, 9,666 bytes, expected CSV content type; the page displayed that the sample was received.
3. Prior large archive service-access download passed all 51 entries' CRCs. Native browser GETs reached the Worker and returned HTTP 200 without stream errors.
4. Even after the FixedLengthStream repair, hosted GET ranges still omit Content-Length; the native Worker-runtime test preserves it. No evidence that valid chunked delivery causes the browser failure.

Conclusion: the cloud browser has a general file-saving failure, so its failed ZIP saves cannot serve as a valid application regression result. This does not prove ordinary desktop/mobile browser success. Do not bypass browser policy or introduce a memory-heavy Blob workaround into the export flow: the local Blob control fails too. Need a functioning download-capable browser or a specific user-browser interrupt error to close the E2E gate. Application fixes and payment enforcement remain intact. Diagnostic fixture is retained at examples/download-check.tsx for reproducibility; no test route remains deployed.

### Download resume authorization — 2026-10-07 23:45 ET

- Extended new download capabilities from two minutes to one hour, capped at the export expiry. Every request still checks current export state, payment, refunds, and expiry in D1. No shop binding is claimed: Parcel is a standalone CSV service and capabilities bind to the export and archive part.
- The Download ZIP action already issues a fresh URL on each click; the visible fallback uses that URL. A new click can recover after link expiry but does not automatically resume an existing browser download.
- Regression coverage checks exact-byte range continuation after the old two-minute boundary, rejection at the new one-hour boundary, package-expiry capping, and immediate payment/state revocation. Ordinary-browser saving and interrupted-transfer behavior remain unverified.
- No further streaming changes are justified by the cloud-browser Blob failure. Hosted Content-Length rewriting remains a separate observation; neither HTTP version nor the precise intermediary has been identified.


## Three-phase implementation — 2026-10-08 ET

### Phase 1: reliability and evidence
- [x] Preserve payment/state/expiry authorization, one-hour download URLs and streaming limits.
- [x] Add reusable streamed response verification against independent stored-archive byte count and SHA-256. Multi-segment route test compares to stored segments; tests reject HTML, HTTP errors, truncation and equal-size corruption. Run `npm test` (Node 22+).
- [x] Stop classifying every HTML redirect as an authentication failure. Keep redacted status, final path, redirect flag and request ID diagnostics.
- [x] Add plain `/diagnostics/download.html` with a fixed tiny text download and in-page fetch/size/hash control, no application framework. Private Site access remains in force. Browser outcomes must be recorded separately.
- [ ] Original historical HTML response: still not reproduced. A redirect flag/final URL cannot reveal the full chain; capture the Network panel if it recurs.
- [ ] Browser ZIP save/extraction and interrupted-transfer resume in desktop Chrome/Firefox and mobile remain release gates. Mocked tests or service access do not satisfy them.
- [ ] Hosted ZIP GET Content-Length discrepancy remains low priority; no new speculative streaming changes.

### Phase 2: workflow and usability
- [x] Neutral results-page heading; distinguish queued, saving, packing, partial, failed, cancelled and expired job states.
- [x] Collapse homepage introduction after upload/recovery and bring the export card into view.
- [x] Three-image quick sample, with original 50-image sample offered separately. Source files are unchanged; size depends on Shopify CDN.
- [x] Inline email validation with focus and accessible error association.
- [x] Estimate remaining image-check time from observed progress; show packing separately and avoid an invented countdown before progress is measured.
- [x] Hide raw private link until requested; remove redundant View results link on results page; preserve copy fallback.
- [x] Expire visible download fallback when its capability expires; prompt for a fresh link.
- [x] Replace manifest jargon in selection/help text and update Support's one-hour expiry and saved-export guidance.
- [ ] Full desktop/mobile visual, keyboard, file-picker and fresh-profile recovery checks remain unverified until performed.

### Phase 3: launch preparation
- [x] Distinct complete/partial/failed email subject and body. Failed packing does not promise a downloadable ZIP; already-paid jobs do not request payment again.
- [x] Mock-provider integration tests cover actual notification queue outcomes and retain frozen-payload/idempotent retries. No email sent to a real recipient.
- [x] Add release checklist and repeatable verification instructions below.
- [ ] Owner domain choice/purchase, support contact, business policy review, secure Stripe/Resend configuration and authorized test recipient.
- [ ] Actual test checkout, paid return/cancellation, payment verification and recipient delivery. Do not enable live charging or email or make the Site public before these gates.

### Verification instructions
1. `npm test` runs Node tests including native Workers framing and stored-archive delivery integrity. A CI runner can run the same command after dependency installation. No external CI service is configured or claimed to have run.
2. `scripts/verify-download.mjs` accepts stdin JSON with `url`, independently known `bytes` and `sha256`, and optional private-Site `authorization`. It streams without buffering the whole ZIP, refuses redirects, and prints only size/hash on success. Never put credentials or signed URLs in command arguments, logs, or committed files.
3. Browser control: open `/diagnostics/download.html` directly. Save hello.txt, then click Check delivered bytes. Record download success separately from fetch/hash success. This control shares Sites hosting/private access; it cannot identify a specific browser policy by itself.
4. Manual release gate: use one job's exact ZIP for service and browser comparisons (separately generated jobs can have different metadata and hashes). Download/extract, compare size/hash and entry CRCs, interrupt and resume beyond two minutes, repeat in Firefox/mobile, then recover the same export from its complete private link in an independent profile. The quick sample now has three images plus manifest; 51 entries applies only to the original 50-image sample with manifest and no failures.


### Live verification — 2026-10-08 20:44 ET, v25

- Cloud browser saved the plain 20-byte hello.txt control. Local saved bytes equal the source fixture; SHA-256 b737146fb0595e9614a1d831919579697017d3806c99dc30c67c4ad0dd00e914. In-page fetch also passed size/hash. The previous blanket cloud-download limitation does not hold in this new session; no browser-policy root cause was established.
- Clicked the three-image quick sample; invalid email showed inline feedback and focused the input; blank email created a free export. No email requested or sent.
- Opened View results, reloaded, and recovered the correct job. This was same-profile recovery, not independent-profile verification.
- Unattended worker completed 3/3 images. Clicked Download ZIP in the browser and obtained a saved 13,729,910-byte archive. All four entries (three images and manifest.csv) passed CRC checks.
- Separate authenticated service GET returned 200 and the same 13,729,910 bytes / SHA-256 629bdc450f8b0723ea1af05ce0b9e432ad24e190adb8a3889fdaf47222cca2b3. New capability reported 3,600 seconds.
- 79 automated tests passed, including mocked complete/partial/failed notification queue sends. TypeScript and production build passed.
- Still unverified: interrupted browser transfer/resume, Firefox/Safari/mobile and independent-profile recovery; full 50-image browser save in this new session; external CI execution. Historical HTML/JSON failure is not reproduced. Do not call this a complete production release sign-off.


### Phase 1 completion pass — 2026-10-08 21:10 ET

New confirmed fix:
- Reproduced Start a new export leaving the old job visible on the homepage: same-document fragment navigation did not reset React state. Replace the URL with /#exporter without firing hashchange, then reload after removing only the last-job pointer. Per-job recovery links remain valid. If storage removal fails, show an error rather than claiming a reset.
- Deployed in v27. Live regression: return to homepage, confirm Start a new export, select the quick sample, observe Prepare my ZIP; then reopen the prior large export and recover all 50 images successfully.

Live delivery evidence:
- Created a new 10-product / 50-image sample from the UI. Unattended worker completed all 50 images and packing; no checkout required.
- Native Chrome Download ZIP click produced a saved 248,769,680-byte archive. Browser automation timed out while awaiting the UI action, but the completed file synchronized and was verified independently. All 51 entries (50 images + manifest.csv) passed CRC checks.
- SHA-256: 5d16bb0a565eaecb99b7f69bf8eee29db62f0180373369b6e4fdca1e9bda3dfa. Separate authenticated HTTP 200 download of the exact same job matched both size and hash. This is distinct from the old, expired 248,772,320-byte test package.
- Actual quick-export HTTP interruption: read 1,048,576 bytes, close the connection, wait beyond 125 seconds from URL issuance, resume the same URL with Range and If-Range. Received HTTP 206, reconstructed 13,729,910 bytes, and matched SHA-256 629bdc450f8b0723ea1af05ce0b9e432ad24e190adb8a3889fdaf47222cca2b3. Completion was at 131 seconds. The cancelled invocation in Worker logs was the intentional test interruption.
- curl HTTP/1.1 and HTTP/2 both delivered the requested bytes 0-1023 with HTTP 206, Accept-Ranges, Content-Range and no-transform. Both omit Content-Length; HTTP/1.1 uses chunked encoding. Neither reported Content-Encoding or cf-cache-status. This rules out a browser-only observation but does not identify the rewriting intermediary: these shell requests also traverse managed infrastructure. No further streaming change made.
- 79 automated tests passed; TypeScript and production build passed.

Remaining verification limits (do not mark passed):
- Browser download-manager pause/network interruption/resume: only HTTP client interruption and automated route coverage verified. Available browser controls do not expose throttling or download-manager resume.
- Firefox/Safari/mobile and independent browser profile: not available in this environment. Same-profile recovery and storage-free capability unit tests pass but are not substitutes.
- Original HTML response failure did not recur. Error handling and redacted diagnostics exist; root cause and full redirect chain remain unknown pending a recurrence.
- Hosted Content-Length rewriting remains a non-blocking investigation; complete delivery and exact range resume are demonstrated despite it.
- Tests ran locally, not in an external CI service.


### Phase 2 usability pass — 2026-10-08 21:54 ET

Implemented and deployed in v29:
- Hide the optional email field when delivery is disabled. Preparation explains that users must save the private return link; the client omits email from new job requests while disabled. Enabled delivery retains inline validation and outcome-based wording.
- Stop displaying Finding your saved export after a status request fails. Missing and expired jobs receive distinct headings, and terminal 403/404/410 responses stop automatic polling. Transient failures keep automatic retry and a manual Retry connection action.
- Clear a stale job after terminal access failure so its download controls are not still displayed. Configuration refresh no longer erases a concurrent job-recovery error.
- Incomplete private links show a single error and a Prepare a new export action instead of a contradictory empty/loading state.
- Make the revealed private link 16px with a 48px input height, improve secondary results text readability, and give results navigation links 44px minimum targets.

Verification:
- All 79 automated tests passed. TypeScript and production build passed. Private deployment succeeded.
- Reloaded the deployed results page and used Start a new export to reach the upload screen.
- The native file-picker test stalled and timed out; a subsequent browser tab-list request also timed out. No valid file-picker result, keyboard pass, responsive/mobile pass, or final screenshot was obtained. Browser failure is a test-environment limitation, not proof of application failure or success.
- Full desktop visual acceptance, invalid CSV feedback through the file picker, same-file reselection, keyboard navigation, mobile layout, and independent-profile recovery remain open. Existing parser/recovery tests are not substitutes for these UI checks.

### Code-gap repair — October 9, 2026

Implemented durable checkout ownership and frozen request recovery, conservative replay limits, reconciliation independent of file expiry, commit-time late-payment refund eligibility, and operator alerts/acknowledgement for billing and email cases. Current download expiry documentation is corrected. Migration 0003 adds nullable checkout/review fields and a default-off checkout-review flag; existing sessions remain eligible for reconciliation.

Validation: 89 automated tests passed, including 10 new failure regressions using real SQLite migrations and mocked providers; TypeScript passed. Covered lost Stripe/PayPal responses, provider switching prevention, exact payload recovery after origin changes, stale replay prevention, late settlement after cleanup, no new expired PayPal captures, expiry during capture, duplicate confirmation, previously paid expiry, alert authorization/acknowledgement, and failed-email data erasure. No real payment or email was sent. Provider sandbox, browser/device and production-load gates remain open.
