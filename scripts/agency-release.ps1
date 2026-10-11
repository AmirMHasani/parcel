# Agency plan — the single production release, step by step with confirmations. Run from D:\parcel-deploy in
# PowerShell, on main, after docs\agency-verification.md rows 1–27 passed on staging and PR #1 has been merged.
#
#   powershell -ExecutionPolicy Bypass -File scripts\agency-release.ps1
#
# Order (docs\agency-runbook.md → "Release and rollback"): rehearse the migration on a production copy → migrate →
# upload the new version with no traffic → gradual rollout with AGENCY_ENABLED still 0 → flip the flag → smoke test.
# Rollback at any point: pnpm exec wrangler rollback   (the migration is additive and needs no undo).
$ErrorActionPreference = "Stop"
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Confirm($q) { $a = Read-Host "$q [y/N]"; if ($a -ne "y") { Write-Host "Stopped. Nothing further was changed."; exit 1 } }

Step "Checking the deploy copy"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "main") { Write-Host "Run this from D:\parcel-deploy on main (current: $branch)." -ForegroundColor Red; exit 1 }
git pull
$dirty = (git status --short | Out-String).Trim()
if ($dirty) { Write-Host "The deploy copy has local changes. It must be a clean copy of main." -ForegroundColor Red; exit 1 }
$hasAgency = Test-Path "lib\agency-billing.ts"
if (-not $hasAgency) { Write-Host "main does not contain the agency code yet. Merge PR #1 first." -ForegroundColor Red; exit 1 }
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck

Step "Stripe LIVE checklist (dashboard, done by you)"
Write-Host " - new restricted LIVE key with subscription permissions installed:  pnpm exec wrangler secret put STRIPE_SECRET_KEY"
Write-Host " - live Product 'Parcel Agency' + $49/month price created; its price id goes into wrangler.jsonc STRIPE_AGENCY_PRICE_ID (production vars)"
Write-Host " - Terms URL set in Public details; Customer Portal configured (or STRIPE_PORTAL_CONFIG_ID set); Smart Retries → cancel after final retry; customer emails on"
Write-Host " - Stripe Tax active in LIVE mode (head office + registrations) since production has STRIPE_TAX=1"
Confirm "All of the above done?"

Step "Rehearsing migration 0005 on a copy of the PRODUCTION database"
pnpm exec wrangler d1 export DB --remote --output prod-copy.sql
node scripts/rehearse-migration.mjs prod-copy.sql
$rehearsal = $LASTEXITCODE
Remove-Item prod-copy.sql -Force
if ($rehearsal -ne 0) { Write-Host "The migration rehearsal failed (see the FAIL lines above). Nothing has been changed. Stopping." -ForegroundColor Red; exit 1 }
Confirm "Rehearsal passed — apply the migration to production now? (today's code keeps working against it)"
pnpm exec wrangler d1 migrations apply DB --remote

Step "Uploading the new version WITHOUT traffic"
pnpm build
pnpm exec wrangler versions upload
Write-Host "Copy the new version id from the output above."
$vid = Read-Host "New version id"
Confirm "Send 10% of traffic to $vid (AGENCY_ENABLED is still 0, so it behaves like today's site)?"
pnpm exec wrangler versions deploy "$vid@10%" -y
Write-Host "Watch https://parcelexport.com and  GET /api/ops  for a few minutes (errors, stalled jobs)."
Confirm "Looks healthy — move to 100%?"
pnpm exec wrangler versions deploy "$vid@100%" -y

Step "Turning the plan on"
Write-Host "In wrangler.jsonc (production vars) set AGENCY_ENABLED to ""1"" and STRIPE_AGENCY_PRICE_ID to the live price id; commit to main and push (from D:\parcel or a clean clone), then:"
Confirm "wrangler.jsonc updated on main and pulled here?"
git pull
pnpm run deploy

Step "Smoke test with your own card (record in docs\agency-verification.md → Release day)"
Write-Host " 1. node scripts\agency-admin.mjs code AGENCY-OWNER   → wrangler d1 execute DB --remote --command ""<sql>"""
Write-Host " 2. https://parcelexport.com/agency → code → pay → key shown → one export → cancel in the portal → refund in the Stripe dashboard → account shows the cancellation"
Write-Host " 3. GET /api/ops with the worker secret: agency block present, no alerts"
Write-Host "Then issue AGENCY-BETA to the first agency. Rollback at any time: pnpm exec wrangler rollback, or AGENCY_ENABLED=0 + pnpm run deploy."
