# Laravel Cloud experiment

**Status: installed and verified on Laravel Cloud.** This is an experimental,
single-instance deployment, not a highly available installation.

- Application: https://postiz-production-ymk27x.laravel.cloud
- Fork: https://github.com/artisan-build/postiz-app
- The initial owner is activated. Use Postiz's **Forgot password** flow to choose
  your own password; the temporary setup password has been rotated and removed
  from Cloud's environment configuration.

## Topology

Use Cloud's Node 22 runtime with exactly one always-on application instance.
The start command supervises the upstream backend, Temporal worker/orchestrator,
Next frontend, and the native Temporal server. A small HTTP proxy listens on
`[::]:$PORT`, routing `/api/*` to the backend and other requests to Next. The
listener opens immediately to satisfy Cloud's approximately 15-second TCP startup
deadline, but returns HTTP 503 until all services and initial owner claiming pass.

Attach Cloud-managed PostgreSQL, Valkey, and a public object-storage bucket.
Use the account's existing Resend configuration. No Docker, Elasticsearch,
Temporal Cloud account, persistent application volume, or external Redis service
is needed by this design. Social providers still require their own OAuth apps
and credentials; optional AI/video integrations need their respective providers.

Provision three databases on the same Cloud-managed PostgreSQL cluster: one for
Postiz, one for Temporal history, and one for Temporal visibility. Attach only
the Postiz database to the application. The cluster role must be able to create
and alter tables in all three databases. Back them up together. Separate physical
databases avoid relying on connection-level `search_path` overrides: the first
Cloud migration attempt using those overrides placed Temporal tables in `public`,
and Prisma correctly refused to drop them.

Four upstream source files change: both R2 clients accept
`CLOUDFLARE_ENDPOINT`, preserving the original default, and the cookie-domain
helper honors private public suffixes. Without the latter, it selects
`.laravel.cloud`, which Chromium rejects rather than storing the login cookie.
The shared Redis client supplies TLS SNI for `rediss://` endpoints: without it,
the managed Valkey connection resets instead of completing its TLS handshake.
Everything else is isolated in this directory, plus a binary gitignore entry and
a cookie-domain regression test alongside the helper.

## Cloud settings

- Build: `bash .cloud/build.sh`
- Deploy: `node .cloud/deploy.cjs`
- Start: `node .cloud/start.cjs`
- Node: 22 (upstream pins 22.23.4); pnpm: 10.6.1.
- The current experiment uses one `flex.m-4vcpu-4gb` application instance,
  PostgreSQL 17 (0.5–1 compute units, no suspension), and 250 MB Valkey with
  hibernation disabled and a no-eviction policy.
- Allow more build memory than this 3.8 GiB orb. The build sets a maximum
  Node heap of 8 GiB; that is a ceiling, not a measured requirement.
- Disable hibernation, autoscaling, and automatic push-to-deploy.
- Allow at least 75 seconds for graceful shutdown: children stop in reverse
  dependency order with a 15-second limit each.

Cloud-injected variables are translated by `environment.cjs`: `APP_URL`,
`DATABASE_URL`, `REDIS_URL`, `AWS_BUCKET`, `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`. Confirm these exact names and values
against the new environment before deployment. Supply `CLOUDFLARE_BUCKET_URL`
explicitly with the bucket's public delivery URL: Cloud does not automatically
inject it. An explicitly configured `AWS_URL` is also mapped. Configure bucket
CORS to allow the app origin for direct multipart uploads.

Supply private environment variables, never commit their values:

- `JWT_SECRET`: persistent, randomly generated application secret.
- `TEMPORAL_PG_DATABASE`, `TEMPORAL_PG_VISIBILITY_DATABASE`: dedicated database
  names, defaulting to `temporal` and `temporal_visibility`. This experiment
  reuses the initially provisioned `production` database for Temporal history,
  with `postiz` for the app and `temporal_visibility` for visibility.
- `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`: existing verified
  Resend configuration. `MAIL_FROM_ADDRESS`/`MAIL_FROM_NAME` are also mapped.
- `POSTIZ_OWNER_EMAIL`, `POSTIZ_OWNER_PASSWORD`: initial account credentials.
  The launcher registers the owner through Postiz before allowing public
  application traffic. Postiz sends its normal activation email. Registration remains
  disabled after the first organization is created. Remove the password from
  Cloud after successful initialization. If deliberately overriding
  `DISABLE_REGISTRATION=false`, automated owner claiming is skipped; complete
  registration yourself before sharing the URL.

Database TLS uses hostname verification; local testing alone uses
`sslmode=disable`. A private CA would require additional trust configuration;
do not disable verification to work around it. If Cloud injects a PostgreSQL DNS
alias not covered by the provider certificate, configure `TEMPORAL_PG_HOST` with
the certificate-matching provider hostname. This does not change Postiz's
`DATABASE_URL`, database credentials, or TLS verification requirements.

## Critical deployment constraint

**Do not run two copies of this embedded Temporal server against the same
database during a rolling deployment.** Their loopback membership addresses are
not mutually reachable. Setting the replica count to one does not prevent old
and new releases from overlapping.

Use stop-old → deploy/migrate → start-new, accepting downtime:

1. Stop the environment with Cloud's environment `/stop` API action.
2. Confirm its status is `stopped`, the application logs say **All services are
   stopped**, and the old endpoint is offline. The status response alone is not
   proof that the old processes have terminated.
3. Start with the environment `/start` action and `redeploy: false` to build the
   latest branch commit. `redeploy: true` selects the previous commit instead.
4. Wait for deployment success, then confirm `/api/` returns HTTP 200 with
   **App is running!** and browser login works. A green deployment alone does not
   prove that the startup gate has opened.

This sequence was exercised on Cloud, preserving the activated owner and its
organization across the stop and subsequent deployment. Do not use ordinary
rolling deployments for this topology. A crashed or sleeping instance cannot
publish scheduled posts; persistence allows recovery, not continuous availability.
Changes to Temporal's pinned version or history shard count require explicit
migration planning.

## Validation to date

- Frozen-lockfile dependency installation succeeded.
- Checksum-verified native Temporal 1.28.1 and CLI 1.4.1 installed.
- Local PostgreSQL schema initialization succeeded: Temporal history version
  1.17 and visibility version 1.9, alongside Postiz's Prisma tables.
- The native Temporal server reported `SERVING`.
- A real Temporal SDK workflow persisted a timer, the server stopped and
  restarted, and the workflow returned its expected result afterward.
- The upstream backend and Next production builds ran out of memory locally.
  The complete upstream production build subsequently succeeded repeatedly on Cloud's
  native Node 22 ARM64 build environment. Initial deployment exposed a
  PostgreSQL alias/certificate mismatch; the canonical-host fix passed the
  subsequent Cloud deployment's native Temporal migrations.
- The deployment script passed against the three actual managed databases:
  history version 1.17, visibility version 1.9, and initialized Postiz tables.
- Cookie-domain regression failed before the private-suffix fix and passed
  afterward, with custom-domain and localhost controls unchanged. Chromium
  rejected the parent-suffix cookie and accepted the application-domain cookie
  on an intercepted compatibility page. Actual Cloud login then succeeded;
  Chromium stored an application-domain, Secure, HttpOnly, SameSite=None cookie.
- Resend reported the initial activation email as delivered. The owner was
  activated through Postiz's normal activation endpoint, and the normal password
  reset flow and a fresh browser login succeeded after the stop/start deployment.
- On the actual Cloud cache, default ioredis failed with **Connection is closed**;
  adding SNI returned **PONG**. Executing the patched shared client against that
  cache also returned **PONG**, and subsequent runtime logs had no connection resets.
- Against the actual Cloud-managed R2 bucket, `uploadFile`, `uploadStream`,
  `simpleUpload`, and multipart upload all passed public byte-for-byte retrieval.
  Multipart checks also covered signed part URLs, CORS preflight, and exposed
  ETag headers. Disposable uploaded objects were removed afterward.
- The production launcher started all four services on Cloud. `/api/` returned
  HTTP 200, registration was closed, and the authenticated calendar rendered.
- A browser upload completed, appeared in Media, and its public URL loaded a
  640×360 image. The upstream Uppy compressor converts the input's 16-bit PNG to
  8-bit PNG, so this browser path is not byte-identical to the original fixture.
  The disposable media item and public object were removed after verification.

Social account connection and an actual scheduled social post remain unverified:
no social-provider credentials or accounts were connected. The durable workflow
timer restart test above ran locally, not against the Cloud production worker.
Connect the desired providers and verify a scheduled post before relying on this
installation for publishing. Optional AI/video services are not configured.

Upstream server-side `uploadFile` and `uploadStream` send a public-read ACL.
Despite the documented R2 ACL limitation, these requests succeeded against the
provisioned Cloud bucket, so the adapter leaves that upstream behavior unchanged.
