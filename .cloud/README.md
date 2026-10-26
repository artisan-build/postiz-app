# Laravel Cloud experiment

**Status: Cloud deployment in progress, not production-ready.** The organization
fork is connected. A full upstream production build exceeds this orb's available
memory; the build script is being validated on Cloud.

## Proposed topology

Use Cloud's Node 22 runtime with exactly one always-on application instance.
The start command supervises the upstream backend, Temporal worker/orchestrator,
Next frontend, and the native Temporal server. A small HTTP proxy listens on
`[::]:$PORT`, routing `/api/*` to the backend and other requests to Next.

Attach Cloud-managed PostgreSQL, Valkey, and a public object-storage bucket.
Use the account's existing Resend configuration. No Docker, Elasticsearch,
Temporal Cloud account, persistent application volume, or external Redis service
is needed by this design. Social providers still require their own OAuth apps
and credentials; optional AI/video integrations need their respective providers.

Postiz tables live in PostgreSQL's default schema. Temporal history and visibility
live in separate `temporal` and `temporal_visibility` schemas in the same database,
selected using PostgreSQL `search_path`. Back up all three schemas together.
Provision those two schemas through database administration before the first
deployment. The runtime role needs permission to create and alter tables there.
The deployment adapter leaves schema provisioning outside application code to
respect the repository's prohibition on raw SQL queries.

Only two upstream source edits are needed: allow `CLOUDFLARE_ENDPOINT` in both R2
clients, preserving the original endpoint as the default. This allows Cloud's
regional R2 endpoint without changing upload behavior for existing installations.
Everything else is isolated in this directory, plus a binary gitignore entry.

## Proposed Cloud settings

- Build: `bash .cloud/build.sh`
- Deploy: `node .cloud/deploy.cjs`
- Start: `node .cloud/start.cjs`
- Node: 22 (upstream pins 22.23.4); pnpm: 10.6.1.
- Allow more build memory than this 3.8 GiB orb. The draft build sets a maximum
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
- `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`: existing verified
  Resend configuration. `MAIL_FROM_ADDRESS`/`MAIL_FROM_NAME` are also mapped.
- `POSTIZ_OWNER_EMAIL`, `POSTIZ_OWNER_PASSWORD`: initial account credentials.
  The launcher registers the owner through Postiz before opening its public
  listener. Postiz sends its normal activation email. Registration remains
  disabled after the first organization is created. Remove the password from
  Cloud after successful initialization. If deliberately overriding
  `DISABLE_REGISTRATION=false`, automated owner claiming is skipped; complete
  registration yourself before sharing the URL.

Database TLS uses hostname verification; local testing alone uses
`sslmode=disable`. A private CA would require additional trust configuration;
do not disable verification to work around it.

## Critical deployment constraint

**Do not run two copies of this embedded Temporal server against the same
database during a rolling deployment.** Their loopback membership addresses are
not mutually reachable. Setting the replica count to one does not prevent old
and new releases from overlapping.

The experiment requires a verified stop-old → deploy/migrate → start-new
procedure, accepting downtime. Cloud's API documents environment `/stop` and
`/start` actions, but their full deployment lifecycle has not yet been tested
for this application. Do not enable ordinary rolling deploys until this is resolved. A
crashed or sleeping instance cannot publish scheduled posts; persistence allows
recovery, not continuous availability. Changes to Temporal's pinned version or
history shard count require explicit migration planning.

## Validation to date

- Frozen-lockfile dependency installation succeeded.
- Checksum-verified native Temporal 1.28.1 and CLI 1.4.1 installed.
- Local PostgreSQL schema initialization succeeded: Temporal history version
  1.17 and visibility version 1.9, alongside Postiz's Prisma tables.
- The native Temporal server reported `SERVING`.
- A real Temporal SDK workflow persisted a timer, the server stopped and
  restarted, and the workflow returned its expected result afterward.
- Backend and orchestrator reached startup using temporary transpiled output.
  This does **not** validate the upstream production build or type checking.
- The upstream backend and Next production builds ran out of memory locally.
  No frontend, Cloud deployment, R2 upload, Resend delivery, social account
  connection, or actual scheduled social post has been verified.

Before calling the installation successful, complete a production build on
Cloud, verify stop-before-start deployment, activate/login as the owner, upload
and retrieve media, connect a social account, and schedule a post across a
controlled restart. Confirm Resend delivery and public bucket CORS separately.
Upstream server-side `uploadFile` and `uploadStream` still send a public-read ACL;
Cloud documents R2 object ACLs as unsupported. Exercise these paths as well as
browser multipart uploads and resolve that compatibility issue before claiming
full media-upload support.
