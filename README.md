# never-map

Personal Excalidraw editor deployed independently on Cloudflare Workers.
No membership, payment, multiplayer, AI or dependency on Byfloral's server.

## Features

- Official Excalidraw editor, Chinese interface, self-hosted fonts.
- IndexedDB local autosave, complete `.excalidraw` backup and PNG export.
- Optional private cloud scene in D1; content-addressed images in private R2.
- Optimistic revisions prevent silent overwrites by another device.
- R2 reservations before operations: 90% warning, 99% stop, fail closed when
  the account baseline or current month has not been verified.
- Single image capped at 2 MB; cloud scene structure capped at 1 MB.

## Build and check

Use Node.js 24 and pnpm. On this Windows host run `scripts/project-env.cmd`
first so caches and temporary downloads remain under this project.

```
pnpm install --frozen-lockfile
pnpm run build
pnpm exec wrangler deploy --dry-run --outdir .tmp/worker-build
pnpm test
```

Excalidraw is MIT-licensed. See `THIRD-PARTY-NOTICES.md` and the installed
package license. This wrapper uses the official editor rather than attempting
to recreate the drawing engine. Dependencies are pinned by `pnpm-lock.yaml`.

## Cloud deployment

Cloud saving is disabled by default until permissions, usage and the Free
Workers plan are confirmed. Add the D1 and R2 bindings to `wrangler.jsonc`,
apply `migrations/0001.sql`, provision the personal `ACCESS_TOKEN` with
`wrangler secret put`, and initialize quota from verified account metrics.
Only then set `CLOUD_ENABLED=true` and deploy. Never commit either API token
or personal access token. Use Standard R2 storage only.

Do not expose the R2 bucket publicly or distribute S3 credentials. Assets
are read and uploaded only through the authenticated Worker so quota guards
cannot be bypassed by the editor.

## Free usage boundaries

The screenshot's R2 free allowances are 10 GB-month of Standard storage,
1,000,000 Class A operations/month and 10,000,000 Class B operations/month.
Storage is GB-month, not a fresh 10GB upload allowance each month. This app
conservatively caps instantaneous stored bytes below 10GB and never resets
stored bytes at month rollover. Reservations for failed uploads remain
counted until an administrator reconciles them.

Warnings are shown in the editor. At 99% the app stops cloud reads/writes;
local editing and export continue. New months stay paused until verified.
These are application guards, not an account-wide Cloudflare billing cap.
External dashboard/S3/other-bucket operations require reconciliation. The
account owner has confirmed R2 is dedicated to never-map.

## Current status

Local build is ready. Live deployment, cloud storage, threshold reminders
and GitHub push must be separately verified; local code alone is not proof
that any of those have been enabled on the provider.
