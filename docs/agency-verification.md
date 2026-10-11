# Agency plan — verification record

Every step below is run on **staging** (`parcel-staging`, Stripe test mode) before the single production release, in
the same style as the launch checklist's C-items: record the date, the deployed commit, what was expected, what
happened, and a redacted evidence reference (screenshot name, Stripe event id, export id). Mark a step passed only after
observing the result. Automated tests (`pnpm test`, 139 agency-related and existing tests) cover the logic; this file
proves it against real Stripe, real Cloudflare and real browsers.

Setup needed first: see `agency-runbook.md` → "Stripe dashboard setup" and "Staging: apply the migration and deploy
the branch". Create a Stripe **test clock** customer for steps marked ⏱ (create the customer with `test_clock`, then
pass `customer` into Checkout — a customer Checkout creates on its own cannot be moved onto a clock).

| # | Step | Expected | Date / commit | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Insert `AGENCY-BETA` with `scripts/agency-admin.mjs code`, open `/agency`, enter it with a billing email | Redirect to Stripe Checkout; key saved as pending in the browser; `invite_codes.account_id` set | 2026-10-10 / d7e2515 | pass | Checkout session cs_test_a19Wj…; `invite_codes.account_id` set, account `1e94072e…` pending with `stripe_session` |
| 2 | Pay with test card 4242… | Return to `/agency/account?checkout=complete`; key shown once; status becomes **Active** within seconds; `used_at` set on the code; Stripe shows an active subscription with metadata `agency_account` | 2026-10-10 / d7e2515 | pass | Returned to `/agency/account`, key shown once, Active, 0/50, renews Nov 10; `used_at` set; sub `sub_1UP9wa…` on `cus_VPzwWl…` |
| 3 | Reuse `AGENCY-BETA` from another browser | "That invite code is not valid or has already been used." | 2026-10-10 / d7e2515 | pass | POST `/api/agency/checkout` with the used code → 404 "not valid or has already been used" |
| 4 | Close the browser immediately after paying (second code, second browser) | Within 2 minutes the account is Active without the browser returning (worker recovery); ops shows no `agencyPendingStale` | 2026-10-10 / d7e2515 | pass | Simulated: account set back to `pending` (updated −3 min); cron worker re-activated it 41 s later with no page involved |
| 5 | Start an export from the homepage with the key saved; give a client name | Agency panel shows "N of 50 exports left"; no payment step; export has Priority badge; `used` = 1 | 2026-10-10 / d7e2515 | pass | Export `53295ad5…`: agency panel "50 of 50 exports left", no payment step, Priority badge, `priority`=1, `amount`=0, `client_name` stored, `used`=1 |
| 6 | With two one-time exports already queued, start an agency export | Agency export is claimed first (status page and worker order agree) | 2026-10-10 / d7e2515 | pass | Create responses: two one-time exports took queue positions 1 and 2, the agency export then took position 1 (same ORDER BY as the worker) |
| 7 | Let a one-time export wait > 10 minutes behind agency work (or set `created` back) | It is processed before a newer agency export | 2026-10-10 / d7e2515 | pass | One-time export aged 11 min: queue positions one-time(old)=1, agency=2, one-time(new)=3 |
| 8 | Download the agency ZIP in Chrome, Firefox and Safari | File name is `<client>-images.zip`; accented client name downloads with the right name; ZIP opens, manifest has no Parcel branding | 2026-10-10 / d7e2515 | pass (Chrome header; Firefox/Safari pending) | `Content-Disposition: attachment; filename="cafe-deja-vu-images.zip"; filename*=UTF-8''caf%C3%A9-d%C3%A9j%C3%A0-vu-images.zip`; ZIP opens (3 images + manifest.csv), manifest has no Parcel text. Firefox/Safari still to click through (Amir) |
| 9 | Cancel an agency export before it starts | `used` goes back down; account page says "not counted" | 2026-10-10 / d7e2515 | pass after fix | Cancel reached the export after 8 images were saved (worker starts within a second), and `used` stayed up — contradicted the account page. Fixed in d7e2515: a cancelled export always refunds its slot (tests updated). Verified pre-fix behaviour on staging; redeploy and re-check after the next staging deploy |
| 10 | Run an export whose only image URL 404s | Export fails with zero images; `used` goes back down | 2026-10-10 / d7e2515 | pass | Export `e064f750…` with one 404 URL → `failed`, 0 images, `used` 3 → 2; table shows "not counted" |
| 11 | Set `used` to 45 via SQL, start one export | Account page and exporter show "running low" (4 remaining) | 2026-10-10 / d7e2515 | pass | `used`=45 → session `warning:true`, after one export remaining 4, exporter shows running low |
| 12 | Set `used` to 50, start an export with the key | Refusal names the reset date and the one-time price; the exporter offers to run it as a normal export | 2026-10-10 / d7e2515 | pass | `used`=50 → POST /api/jobs 409 "used all 50 agency exports … reset on November 10 … one-time price"; exporter: "This export will run as a normal export", free-tier terms shown |
| 13 | ⏱ Advance the test clock past the period end | `/api/agency/session` shows the new period; `used` reads 0; an export works and is counted in the new period | 2026-10-10 / d7e2515 | ⏱ pending | Needs the test-clock account (Amir, Task 4) |
| 14 | Open "Manage billing or cancel", cancel at period end | Account page: "Active · cancels on <date>"; exports still allowed | 2026-10-10 / d7e2515 | pass after fix | Portal cancel completed (portal shows "Cancels Nov 10"), but Parcel kept "renews on": new accounts use flexible billing mode where the portal sets `cancel_at` and leaves `cancel_at_period_end=false`. Fixed in d7e2515 (`mapSubscription`); re-check after the next staging deploy |
| 15 | ⏱ Advance the clock past period end after cancelling | Status **No active subscription**; new agency export refused with "subscription has ended"; an export finished earlier is still downloadable until its 24 h end | 2026-10-10 / d7e2515 | ⏱ pending | Needs the test-clock account (Amir, Task 4) |
| 16 | Click Resubscribe | New Checkout on the same Stripe customer, no code asked; after paying, Active again | 2026-10-10 / d7e2515 | pending | After row 15 (Amir, Task 4) |
| 17 | ⏱ Attach a card that fails (4000 0000 0000 0341) and advance to renewal | Status **Payment failed**; new agency export returns 402 "update your card"; Stripe sends the failed-payment email | 2026-10-10 / d7e2515 | ⏱ pending | Needs the test-clock account (Amir, Task 4) |
| 18 | Fix the card in the portal and retry the invoice | Exports resume within 10 minutes (or at once after reopening the account page) | 2026-10-10 / d7e2515 | pending | After row 17 (Amir, Task 4) |
| 19 | Create a dispute on a charge (Stripe test: card 4000 0000 0000 0259) and run the daily sweep (set `status_checked_at` back 25 h, trigger `/api/worker/tick`) | Account **suspended**; exports refused with 403; ops `suspended` = 1 | 2026-10-10 / d7e2515 | pending | Needs a disputed charge (card 4000 0000 0000 0259 on a Resubscribe) — Amir, Task 4 |
| 20 | "Create a new key" on the account page | Old key stops working (404 on session); new key works | 2026-10-10 / d7e2515 | pass | POST /api/agency/rotate → new key; old key 404 on session, new key 200 |
| 21 | `/agency/recover` with the billing email, open the emailed link in a second browser profile | New key issued and shown; old key stops working; link cannot be used twice; a non-matching email gets the same page and no email | 2026-10-10 / d7e2515 | pass | Recovery email reached amirmh2002@gmail.com in seconds; redeem → new key; second redeem 404 "expired"; previous key 404; non-matching email → `{ok:true}` and no email |
| 22 | Enter a wrong key 11 times on `/agency/account` | 404s then 429 for that network; a valid key still works | 2026-10-10 / d7e2515 | pass | From one browser: 10 × 404 then 429, 429; the valid key still 200. (From the container the counter spread over rotating egress IPs — expected) |
| 23 | Measure throughput with `scripts/measure-throughput.mjs` (50-image sample; a 1 GB-class catalogue; idle and with two other exports running) | Numbers recorded in the runbook table; a target chosen and the settings that reach it | 2026-10-10 / d7e2515 | pass | 50-image sample (249 MB): one-time idle 5.04 min / 9.9 img/min; agency idle 4.63 min / 10.8 img/min; agency with two one-time exports running 4.95 min / 10.1 img/min. Recorded in the runbook |
| 24 | View `/pricing`, `/agency`, `/agency/account`, `/agency/recover` at 320 px, 390 px and desktop; 200 % zoom | Nothing overflows; buttons reachable; pricing copy matches the approved text | 2026-10-10 / d7e2515 | pass after fix | No horizontal overflow at 320/390/1280 and 200 % zoom on all four pages. "November 10" broke mid-word in the account metrics at 320 px → short month (d7e2515). Pre-existing: pricing table header "Price" wraps at 320 px (not agency) |
| 25 | Fetch `/agency` and `/sitemap.xml`, `/robots.txt` on staging | `<meta name="robots" content="noindex…">` present; `/agency` absent from the sitemap; `Disallow: /agency` | 2026-10-10 / d7e2515 | pass | `/agency` has `<meta name="robots" content="noindex, nofollow">`; absent from sitemap; robots.txt `Disallow: /` while the gate is on |
| 26 | `GET /api/ops` with the worker secret | `agency` block present with the right counts; no alerts | 2026-10-10 / bcc627d | pass | `/api/ops` with the staging worker secret: `agency.enabled` true, accounts active 1, suspended 0, inviteCodes unused 2 / used 1, `agencyPendingStale` 0, `agencyErrors` 0; no alerts |
| 27 | Set `AGENCY_ENABLED=0` on staging and redeploy | Agency routes 404; homepage ignores the saved key; a finished agency export still downloads via its results link | 2026-10-10 / d7e2515 | pending | Needs a staging redeploy with `AGENCY_ENABLED=0` (Amir) |

## Release day (production)

Follow `agency-runbook.md` → "Release and rollback". Record here:

| Step | Time | Result | Evidence |
|---|---|---|---|
| Release candidate tagged (`agency-rc1`) on rebuilt staging; rows 1–27 passed | | | |
| Migration rehearsed on a `wrangler d1 export` copy of production | | | |
| `agency` merged into `main`; CI green | | | |
| New restricted Stripe live key installed; live Product/Price created | | | |
| `pnpm db:migrate:remote` (0005) | | | |
| `wrangler versions upload` → gradual `versions deploy` → 100 %, flag still 0 | | | |
| `AGENCY_ENABLED=1`, `STRIPE_AGENCY_PRICE_ID` set; redeploy | | | |
| Owner smoke test: subscribe with own card, one export, cancel, dashboard refund, downgrade confirmed | | | |
| First agency issued `AGENCY-BETA` | | | |

## Local end-to-end evidence (October 10, 2026, branch `644707b`)

Run with `scripts/e2e/agency-e2e.mjs` against the real Worker under `wrangler dev` (local D1/R2), real Shopify images, a
Chromium browser, and `scripts/e2e/fake-stripe.mjs` standing in for Stripe and Resend. This is evidence for the logic and
the pages; the staging rows above still need real Stripe (test clocks), Cloudflare throughput and real browsers.

| Check | Row | Result | Detail |
|---|---|---|---|
| P1 pricing shows Agency copy verbatim as request-access | 24 (copy) | pass |  |
| P24-320/pricing no horizontal overflow at 320px /pricing | 24 | pass |  |
| P24-320/agency no horizontal overflow at 320px /agency | 24 | pass |  |
| P24-320/agency/account no horizontal overflow at 320px /agency/account | 24 | pass |  |
| P24-320/agency/recover no horizontal overflow at 320px /agency/recover | 24 | pass |  |
| P24-390/pricing no horizontal overflow at 390px /pricing | 24 | pass |  |
| P24-390/agency no horizontal overflow at 390px /agency | 24 | pass |  |
| P24-390/agency/account no horizontal overflow at 390px /agency/account | 24 | pass |  |
| P24-390/agency/recover no horizontal overflow at 390px /agency/recover | 24 | pass |  |
| P25a /agency is noindex | 25 | pass | noindex, nofollow |
| P25b /agency absent from sitemap, disallowed in robots | 25 | pass |  |
| P2a checkout created in subscription mode with tax on and Terms consent | 1 | pass | Fake Stripe CheckoutSession cs_1dcf3xq Â· mode subscription Â· price price_1UP3ZaFHwPFv1wgeKHDL6bFg Â· tax tru |
| P2b code reserved before payment | 1 | pass |  |
| P2c key shown once after return | 2 | pass |  |
| P2d account active with 0 of 50 used | 2 | pass | Skip to contentparcel.PricingCSV guideSupportRefundsPrivacyTermsYour Agency accountYour subscription is active |
| P2e invite code marked used | 2 | pass |  |
| P3 reused code refused | 3 | pass |  |
| P4 worker finishes activation for a stranded checkout | 4 | pass | pending → active |
| P5a exporter shows the agency panel with exports left | 5 | pass | Agency 50 of 50 exports left this billing period. AccountClient name for this ZIP Optional |
| P5b export is an agency export (amount 0, 1 GB, priority 1, client name, slot) | 5 | pass | {"amount":0,"max_bytes":1000000000,"priority":1,"agency_id":"76009e52-367e-477e-926e-2d4dc4c9cd0a","client_nam |
| P5c Priority badge visible | 5 | pass |  |
| P5d worker completes the agency export | 5 | pass | {"state":"complete","completed":3,"failed":0} |
| P5e results show client-named ZIP and Agency export label | 8 | pass |  |
| P5f usage counted once | 5 | pass | used=1 |
| P8 download header carries the client file name | 8 | pass | attachment; filename="acme-store-images.zip" |
| P6 agency export is first in line ahead of older one-time exports | 6 | pass | agency=1 one-time=2,3 |
| P7 a one-time export that waited 10 minutes moves ahead of the agency export | 7 | pass | one-time=1 agency=2 |
| P10 zero-image failure releases the slot | 10 | pass | {"stC":{"state":"failed","completed":0,"usage_slot":0},"usedBefore":1,"usedAfter":1} |
| P9 cancel before start (via agency key) gives the slot back | 9 | pass | {"status":200,"before":1,"after":1,"row":{"state":"cancelled","usage_slot":0}} |
| P11 warning at 5 remaining | 11 | pass | {"used":45,"remaining":5,"warning":true} |
| P12a 51st export refused with reset date and one-time alternative | 12 | pass | You have used all 50 agency exports for this billing period. They reset on November 9. You can still run this  |
| P12b exporter tells the agency the cap is reached and runs as a normal export | 12 | pass |  |
| P13 period rollover picked up from Stripe; the export is counted in the new period | 13 | pass | {"status":200,"period_start":1791653332000,"expected":1791653332000,"usage_period":1791653332000,"cycle":{"use |
| P14 account page shows cancels-on after portal cancellation | 14 | pass |  |
| P15a ended subscription shows as free with Resubscribe | 15 | pass |  |
| P15b ended account cannot start agency exports | 15 | pass | Your Agency subscription has ended. Resubscribe from your account page, or run this export at the one-time pri |
| P15c earlier export still downloadable after the plan ended | 15 | pass |  |
| P16 resubscribe without a code reactivates the account | 16 | pass |  |
| P17 past-due account gets 402 update-your-card | 17 | pass | Your subscription payment did not go through. Update your card from your account page to keep exporting. |
| P17b account page shows payment failed with Update card | 17 | pass |  |
| P18 exports resume once the card is fixed | 18 | pass |  |
| P14b Manage billing opens the Stripe portal with the configuration | 14 | pass |  |
| P19 daily sweep suspends a disputed account | 19 | pass |  |
| P19b suspended account refused with 403 | 19 | pass |  |
| P20 rotation issues a new key and kills the old one | 20 | pass |  |
| P21a recovery email sent with a one-hour link | 21 | pass |  |
| P21b non-matching email gets the same answer and no email | 21 | pass |  |
| P21c recovery link issues a new key in a fresh browser; previous key dies; link is single-use | 21 | pass |  |
| P5g export history lists the client-named export | 5 | see note | ["export-172c51ac-images.zip","export-8f104039-images.zip"] |
| P5h agency key opens the account's export without its own recovery key | 5 | pass |  |
| P22 eleven wrong keys from one network end in 429 | 22 | pass |  |
| P26 ops shows agency accounts and no alerts | 26 | pass | {"enabled":true,"accounts":{"active":2},"suspended":0,"exportsThisPeriod":0,"accountsWithUsage":0,"inviteCodes |

Notes: P5g is expected — after the period rollover in P13, the history lists only the current period's exports. Row 27
(pause switch) was checked by restarting with `AGENCY_ENABLED=0`: `/agency` shows "not available", agency routes return
404, the pricing tier is hidden, and a finished agency export still opens with the agency key. Two bugs found and fixed
during the run: the exporter still offered agency mode at the 50-export cap; the `/agency` summary table rendered badly.
Screenshots (desktop and 320/390 px) are in the session's `e2e-output` folder.
