# Agency plan — put the `agency` branch on the staging Worker (parcel-staging). Run from D:\parcel in PowerShell.
# Safe to re-run. Never touches production: everything uses CLOUDFLARE_ENV=staging.
#
#   powershell -ExecutionPolicy Bypass -File scripts\agency-staging.ps1
#
# Before running: Stripe TEST-mode restricted key created (docs\agency-runbook.md → "Stripe dashboard setup").
$ErrorActionPreference = "Stop"
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Confirm($q) { $a = Read-Host "$q [y/N]"; if ($a -ne "y") { Write-Host "Stopped."; exit 1 } }

Step "Checking the working copy"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "agency") { Write-Host "This must run on the agency branch (current: $branch)." -ForegroundColor Red; exit 1 }
git -c core.autocrlf=true status --short | Out-String | ForEach-Object { if ($_.Trim()) { Write-Host "Uncommitted changes present:`n$_" -ForegroundColor Yellow; Confirm "Continue anyway?" } }
git fetch origin | Out-Null
$behind = (git rev-list --count agency..origin/main).Trim()
if ($behind -ne "0") { Write-Host "agency is $behind commit(s) behind main. Merge main first (git merge origin/main)." -ForegroundColor Red; exit 1 }

Step "Installing dependencies and running the checks CI runs"
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck

Step "Staging secrets"
$env:CLOUDFLARE_ENV = "staging"
Write-Host "Secrets currently set on parcel-staging:"
pnpm exec wrangler secret list
Write-Host "Needed: STRIPE_SECRET_KEY (TEST restricted key with subscription permissions), RESEND_API_KEY, EXPORT_SIGNING_SECRET, PARCEL_WORKER_SECRET."
$put = Read-Host "Set or replace STRIPE_SECRET_KEY on staging now? [y/N]"
if ($put -eq "y") { pnpm exec wrangler secret put STRIPE_SECRET_KEY }

Step "Rehearsing migration 0005 on a copy of the STAGING database (production rehearsal is a release-day step)"
pnpm exec wrangler d1 export DB --remote --output staging-copy.sql
node scripts/rehearse-migration.mjs staging-copy.sql
Remove-Item staging-copy.sql -Force

Step "Applying migrations to parcel-staging-db"
pnpm exec wrangler d1 migrations apply DB --remote

Step "Building and deploying the branch to parcel-staging"
pnpm build
pnpm exec wrangler deploy

Step "Invite codes"
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
pnpm exec wrangler d1 execute DB --remote --command "INSERT OR IGNORE INTO invite_codes(code,created) VALUES('AGENCY-BETA',$now),('AGENCY-TWO',$now),('AGENCY-THREE',$now)"
pnpm exec wrangler d1 execute DB --remote --command "SELECT code, account_id, used_at FROM invite_codes"

Step "Done"
Write-Host "Staging is ready. Check: https://parcel-staging.amirmh2002.workers.dev/api/config  (expect ""agency"":true)"
Write-Host "Then tell Claude the staging URL and the SITE_ACCESS_PASSWORD (if the gate is on) to start the verification run."
Remove-Item Env:CLOUDFLARE_ENV
