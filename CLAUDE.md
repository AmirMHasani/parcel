# Working on Parcel

- `main` is the only branch on GitHub. It always matches what is live on parcelexport.com.
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
