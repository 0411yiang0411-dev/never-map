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

Live deployment: https://never-map.never-map-0411yiang0411.workers.dev

For a NEW deployment, first set `CLOUD_ENABLED=false`, create private D1/R2
bindings, apply the SQL migrations in order, and configure `ACCESS_TOKEN` and
`MONITOR_TOKEN_CF` as Worker secrets. Never put secrets in Git or client code.
Invoke `/api/reconcile` with the personal access token, confirm it is unpaused,
then enable cloud saving. Remain on Workers Free and R2 Standard.

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
local editing and export continue. The Worker reconciles account metrics
hourly. A failed verification pauses operations; verification also expires
after two hours. New months stay paused until verified. Counters are never
lowered, including at month rollover, avoiding billing-date assumptions.
These are application guards, not an account-wide Cloudflare billing cap.
External dashboard/S3/other-bucket operations require reconciliation. The
account owner has confirmed R2 is dedicated to never-map.

## Current status

Published on 2026-10-10. Public assets, authenticated D1 save/reload, private
R2 image upload/exact-byte reload and account quota reconciliation verified
over HTTPS. Fourteen local backend/quota tests pass. Live canvas left blank.
Browser visual QA unavailable due control bridge timeouts; API checks do
not constitute screenshot verification.

Personal key: `.cache/access-key.txt`, restricted to local Administrator/SYSTEM.
Open the editor cloud panel, enter the key, connect, then load the cloud
canvas or explicitly save your local canvas. Personal passwords and Cloudflare
API credentials stay out of Git and URLs.

Personal password is configured as a Worker secret. The cloud panel displays
real connection milestones with a progress bar and offers a persistent shared
link after successful authentication. The shared credential is separate from
the password, stored in the URL fragment and sent in authenticated API headers.
It never embeds the password or Cloudflare API token. Anyone possessing the
link can edit the same canvas without entering a password. Opening it loads
the cloud canvas automatically; idle visible clients check for updates every
20 seconds. Unsaved cloud edits trigger a close-page warning. Conflicting
revisions are rejected rather than silently overwriting another device.
The most recent pre-load shared browser copy is retained as `shared-recovery`
in IndexedDB. Both access methods retain the same quota guards.

## Formatted text

The seven format buttons live inside Excalidraw's left selected-shape panel.
Select characters while editing text, then click highlight, bold, underline,
separator, bullet list, numbered list or todo. Native textarea selection offsets
are captured before blur; only selected characters/lines are transformed.
Formatting and subsequent typing edit directly on the canvas and persist
automatically. There is no modal or separate Apply step. Double-click a
formatted note to edit it inline again, and click its editable checkboxes to
toggle todo status. The header `编辑文字` is an optional editing entry.

Formatted notes are editable structured blocks in element `customData`, with
an SVG image for canvas display and PNG export. Inline editing preserves
the text's canvas position. Existing box geometry is preserved and expanded
vertically if needed. Rendering never
uses foreignObject or external resources. Cloud manifests upload only image
files referenced by current visible elements, avoiding old note-version
uploads. Quota controls remain unchanged. A note is limited to 3000 characters
and its generated SVG must fit the existing private image upload limit.

## Multiple canvases and synchronization

The header canvas list supports creating and renaming independent canvases.
Names and IDs are separate from scene contents. The original canvas keeps ID
`main` and its authoritative legacy `scene` row; migration does not copy or
replace that user's scene. Old shared links continue to open `main`.

Changes, including deleting all elements, queue an automatic upload after
5 seconds. Signing in automatically downloads the selected cloud canvas.
Visible idle clients check for updates every 5 seconds; unchanged revisions
return HTTP 204 and previously loaded image bytes are reused. Network transfer
time may add latency. This is periodic scene synchronization, with revision
conflicts preserved for explicit resolution rather than multiplayer merging.

Each canvas has its own browser cache and pending-upload state. Before
switching, pending content is saved; failed uploads stop switching and retain
local content. Refreshing with pending edits resumes saving when the cloud
base revision is unchanged; if both versions changed, local work is preserved.
The cloud panel offers download, explicit local overwrite and local recovery.
An in-progress local edit will not be replaced by a late background download.

Shared links include the canvas ID in their fragment to open the chosen
canvas. Sharing grants access to this personal workspace, including its other
canvases. Authenticated owner URLs also retain the selected ID across refresh.
The existing account-level quota guards cover all canvases together. A 200
canvas protection limit keeps this personal deployment within a modest data
footprint. Creating a canvas does not create a paid service or a new bucket.

An hourly Codex heartbeat checks public quota status and notifies only on
meaningful warning/pause/recovery changes. This reminder requires Codex to
be available; server checks and stops run independently.
