# Working on Parcel

- `main` is the production branch on GitHub. It always matches what is live on parcelexport.com. The one other branch is `agency` (below); it is never deployed to production.
- Before changing anything: `git pull` on `main`.
- After changing anything: run `pnpm test` and `pnpm typecheck`, commit to `main`, `git push`, then deploy from the deploy copy (below).
- Never deploy from a branch or a copy that is behind `main`: a deploy replaces the whole live site, so it would undo newer work.
- Test risky changes on the private test site first: `CLOUDFLARE_ENV=staging pnpm build && pnpm exec wrangler deploy`.
- Secrets live only in Cloudflare (`wrangler secret`), never in the repository.
- The selling entity is Lumen Collective LLC; support address is support@parcelexport.com.

## Where to deploy from (Amir's Windows PC)

- `D:\parcel-deploy` is a plain clone of `main` used only for deploying. Nobody edits files or switches branches there.
- Deploy with exactly: `cd D:\parcel-deploy`, `git pull`, `pnpm run deploy` (use `pnpm run deploy`, not `pnpm deploy`, which is a different built-in pnpm command). Before deploying, `git status` there must say "On branch main", "up to date with 'origin/main'" and "nothing to commit".
- `D:\parcel` is the working copy for work in progress (local feature branches, uncommitted changes). Never run `pnpm run deploy` from `D:\parcel`: it ships whatever branch and half-finished files happen to be there. Finish work there, test, merge into `main`, push, then deploy from `D:\parcel-deploy`.
- Several Claude sessions may work on Parcel at the same time. Before touching `D:\parcel`, run `git status`; if it is on another branch or has uncommitted changes you did not make, leave them alone and ask Amir instead of switching branches, stashing or committing them.
- After every deploy, check https://parcelexport.com shows the change.

## The `agency` branch (Agency subscription plan)

- The $49/month Agency plan is built on the long-lived `agency` branch and ships to production once, as a single release, after its six phases pass on staging. The plan, decisions and release steps live in the Parcel project doc `agency-subscription-plan.md`.
- `D:\parcel` is usually on `agency` with agency work committed. That is normal. Do not deploy from it, do not merge it into `main`, and do not switch it to `main` for a quick fix (use `D:\parcel-deploy` or a fresh clone). Merge `origin/main` into `agency` at least weekly.
- Deploy the branch only to staging: `CLOUDFLARE_ENV=staging pnpm build && pnpm exec wrangler deploy`, after `CLOUDFLARE_ENV=staging pnpm exec wrangler d1 migrations apply DB --remote`.
- Everything agency-related is behind `AGENCY_ENABLED` (off by default). Only staging sets it to `1` until the release.
- Line endings are Windows-style on disk. From a Linux shell, run git with `-c core.autocrlf=true`, or `git status` will list unchanged files as modified.
