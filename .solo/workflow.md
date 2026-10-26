# Workflow — postiz-app

Our fork of Postiz (`gitroomhq/postiz-app`, AGPL-3.0), deployed to Laravel Cloud for Artisan Build's own social
scheduling at https://social.artisan.build. Cloud packaging lives in `.cloud/` (read `.cloud/README.md` before any
deploy); four small upstream patches are listed there. Proven by the Amp orb experiment of 2026-10-26, whose
demo-org deployment stays a reference only.

## Phase and mode

- phase: production (internal tool; not a Scalpels product)
- default mode: A-autonomous
- merge policy: merge on green CI; no human PR code review (Ed, 2026-10-26)
- merge method: `gh pr merge --squash`

## Hard gate

- `node --test .cloud/*.test.cjs` (launcher environment mapping)
- the cookie-domain regression test next to the helper, plus lint on touched projects
- upstream `Build` workflow (pnpm install --frozen-lockfile + production build)

## CI

- Actions are enabled by the first PR; record the required contexts here once they exist.

## Deployment

- Laravel Cloud org **Artisan Build**, native Node 22 runtime. Use the `laravel-cloud-deploy` skill; never set
  variables Cloud injects for attached resources (DATABASE_URL, REDIS_URL, AWS_*).
- **Push-to-deploy stays OFF and merging does not deploy.** The embedded Temporal server must never overlap a
  second copy: deploy only by stop → confirm "All services are stopped" → start with `redeploy: false` → confirm
  `/api/` says "App is running!" and a browser login works. Downtime is accepted.
- One replica, no autoscaling, no hibernation.

## Upstream

- `upstream` remote = gitroomhq/postiz-app. Upstream security fixes get merged in by PR; re-check the `.cloud`
  patches still apply and redeploy with the stop/start sequence.

## Ship details

- branch naming: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`
- PR target repo: `artisan-build/postiz-app` (never the upstream; `gh repo set-default` is pinned)
