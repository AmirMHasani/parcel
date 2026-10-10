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
| 1 | Insert `AGENCY-BETA` with `scripts/agency-admin.mjs code`, open `/agency`, enter it with a billing email | Redirect to Stripe Checkout; key saved as pending in the browser; `invite_codes.account_id` set | | | |
| 2 | Pay with test card 4242… | Return to `/agency/account?checkout=complete`; key shown once; status becomes **Active** within seconds; `used_at` set on the code; Stripe shows an active subscription with metadata `agency_account` | | | |
| 3 | Reuse `AGENCY-BETA` from another browser | "That invite code is not valid or has already been used." | | | |
| 4 | Close the browser immediately after paying (second code, second browser) | Within 2 minutes the account is Active without the browser returning (worker recovery); ops shows no `agencyPendingStale` | | | |
| 5 | Start an export from the homepage with the key saved; give a client name | Agency panel shows "N of 50 exports left"; no payment step; export has Priority badge; `used` = 1 | | | |
| 6 | With two one-time exports already queued, start an agency export | Agency export is claimed first (status page and worker order agree) | | | |
| 7 | Let a one-time export wait > 10 minutes behind agency work (or set `created` back) | It is processed before a newer agency export | | | |
| 8 | Download the agency ZIP in Chrome, Firefox and Safari | File name is `<client>-images.zip`; accented client name downloads with the right name; ZIP opens, manifest has no Parcel branding | | | |
| 9 | Cancel an agency export before it starts | `used` goes back down; account page says "not counted" | | | |
| 10 | Run an export whose only image URL 404s | Export fails with zero images; `used` goes back down | | | |
| 11 | Set `used` to 45 via SQL, start one export | Account page and exporter show "running low" (4 remaining) | | | |
| 12 | Set `used` to 50, start an export with the key | Refusal names the reset date and the one-time price; the exporter offers to run it as a normal export | | | |
| 13 | ⏱ Advance the test clock past the period end | `/api/agency/session` shows the new period; `used` reads 0; an export works and is counted in the new period | | | |
| 14 | Open "Manage billing or cancel", cancel at period end | Account page: "Active · cancels on <date>"; exports still allowed | | | |
| 15 | ⏱ Advance the clock past period end after cancelling | Status **No active subscription**; new agency export refused with "subscription has ended"; an export finished earlier is still downloadable until its 24 h end | | | |
| 16 | Click Resubscribe | New Checkout on the same Stripe customer, no code asked; after paying, Active again | | | |
| 17 | ⏱ Attach a card that fails (4000 0000 0000 0341) and advance to renewal | Status **Payment failed**; new agency export returns 402 "update your card"; Stripe sends the failed-payment email | | | |
| 18 | Fix the card in the portal and retry the invoice | Exports resume within 10 minutes (or at once after reopening the account page) | | | |
| 19 | Create a dispute on a charge (Stripe test: card 4000 0000 0000 0259) and run the daily sweep (set `status_checked_at` back 25 h, trigger `/api/worker/tick`) | Account **suspended**; exports refused with 403; ops `suspended` = 1 | | | |
| 20 | "Create a new key" on the account page | Old key stops working (404 on session); new key works | | | |
| 21 | `/agency/recover` with the billing email, open the emailed link in a second browser profile | New key issued and shown; old key stops working; link cannot be used twice; a non-matching email gets the same page and no email | | | |
| 22 | Enter a wrong key 11 times on `/agency/account` | 404s then 429 for that network; a valid key still works | | | |
| 23 | Measure throughput with `scripts/measure-throughput.mjs` (50-image sample; a 1 GB-class catalogue; idle and with two other exports running) | Numbers recorded in the runbook table; a target chosen and the settings that reach it | | | |
| 24 | View `/pricing`, `/agency`, `/agency/account`, `/agency/recover` at 320 px, 390 px and desktop; 200 % zoom | Nothing overflows; buttons reachable; pricing copy matches the approved text | | | |
| 25 | Fetch `/agency` and `/sitemap.xml`, `/robots.txt` on staging | `<meta name="robots" content="noindex…">` present; `/agency` absent from the sitemap; `Disallow: /agency` | | | |
| 26 | `GET /api/ops` with the worker secret | `agency` block present with the right counts; no alerts | | | |
| 27 | Set `AGENCY_ENABLED=0` on staging and redeploy | Agency routes 404; homepage ignores the saved key; a finished agency export still downloads via its results link | | | |

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
