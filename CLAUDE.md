# Working on Parcel

- `main` is the only branch. It always matches what is live on parcelexport.com.
- Before changing anything: `git pull` on `main`.
- After changing anything: run `pnpm test` and `pnpm typecheck`, commit to `main`, `git push`, then deploy with `pnpm run deploy`.
- Never deploy from a branch or a copy that is behind `main`: a deploy replaces the whole live site, so it would undo newer work.
- Test risky changes on the private test site first: `CLOUDFLARE_ENV=staging pnpm build && pnpm exec wrangler deploy`.
- Secrets live only in Cloudflare (`wrangler secret`), never in the repository.
- The selling entity is Lumen Collective LLC; support address is support@parcelexport.com.
