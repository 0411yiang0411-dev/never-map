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

Production targets Chrome79 syntax and Chrome61 CSS, with local core-js runtime
polyfills for older Android system browsers. Build output retains two previous
asset generations to protect cached pages during deployment. Known already
removed entry URLs perform a single cache-busting homepage reload, preserving
URL fragments and browser drawing storage. `/connection-check.html` is a small,
credential-free transport/loading check. This improves website compatibility
but does not prove an individual device's connection-closed error is resolved.

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

## Touch and pen input

Canvas input follows PointerEvent pointerType, including hybrid tablets and
touch laptops. One or two fingers slide to pan. Two-finger distance changes
above a small jitter threshold pinch-zoom about the midpoint. Touch movement
is frame-batched so two parallel finger moves do not briefly fight each other.
Mouse editing and toolbar/button taps retain normal behavior. A pen follows
the selected tool: selection selects, the pen tool writes, and eraser erases.
Only the pen tool uses enhanced raw/coalesced sampling. Existing finger contacts
are ignored during stylus contact until lifted to protect against palm movement.
New pen strokes use fixed-width unsmoothed native polylines, retaining every
sampled corner without pressure-driven outline changes. Appending points does
not move preceding vertices. Older strokes are preserved as originally stored.
These remain editable/exportable elements using existing cloud sync. Browsers
without raw-update events fall back to coalesced pointer moves. Hardware latency
and actual iPad/Android stylus behavior require device testing.

The left pen-tool panel provides pressure on/off, maximum stroke width
(0.5–24px), sensitivity and minimum-width ratio. Settings persist in this
browser and are captured at pen-down, affecting new strokes only. Pressure
uses device-reported values. Each segment outline is independently fixed when
sampled; subsequent samples do not smooth or reshape preceding segments.
Pressure strokes preview locally during contact and commit one native freedraw
element at pen-up, retaining source pressures/settings. A narrowly scoped,
version-checked build patch routes only marked pen elements through the stable
pressure-outline renderer for canvas/PNG/SVG export. This avoids async image
decoding and its placeholder icon. Old SVG-backed strokes remain preserved.
Cloud synchronization stores native strokes without an R2 image upload.
Pressure-off strokes continue to use unsmoothed native polylines.

The eraser affects handwritten elements only: native freedraw and marked pen
strokes, including older pressure images. Tables, typed text, normal pictures
and shapes remain protected. Erasing removes touched strokes as whole elements;
it tests actual stroke paths rather than the blank area of their bounds.
Viewport-only notifications skip signature allocation and sidebar scanning;
drag/resize sidebar updates are coalesced to 120ms with a final immediate update.
See `docs/performance-notes.md` for upstream research and measured scope.

## Automatic alignment

Automatic object alignment defaults to on. The toolbar `自动对齐` toggle and
Alt+S change it; the preference is retained in this browser across refreshes
and canvas switches. Excalidraw displays native alignment guides when moving
objects, creating shapes or resizing their edges/handles. Object snapping
uses nearby bounds, centers and equal spacing, with grid mode disabled while
automatic alignment is on. Ctrl/Command temporarily bypasses snapping.
Line and unbound straight-arrow endpoint editing additionally snaps to other
endpoints and object edges/centers within 8 screen pixels, with visual guides.
Rotated lines preserve other point positions. Shift angle constraints, bound
arrow connections and elbow-arrow routing retain their native behavior.

## Editable tables

Use `插入表格` to create a grid. Double-click a table or select `编辑表格`
to edit directly at its canvas position. Type into cells, drag column/row
boundaries to resize, and drag across cells or Shift-click to select a range.
The left selected-shape sidebar provides row/column insertion and deletion,
merge/unmerge, bold, highlight, alignment, width/height, header and copy.
Tab advances across cells, Enter moves down, Shift+Enter adds a line break.
Changes commit automatically after 350ms and use the existing cloud sync.
Click outside, press Escape or choose `完成编辑` to finish editing.
While editing, wheel/trackpad scrolling pans the canvas, Shift-wheel pans
horizontally, and middle-button dragging pans without closing the editor.
Ctrl/Command-wheel zooms about the cursor. Dragging a selection near a viewport
edge automatically pans in that direction, even while the pointer stays still;
offscreen cells remain selectable without shrinking the whole table.
Merging displays the upper-left value and retains other cell values;
unmerging restores their visibility.

Pasting HTML tables or tab-delimited spreadsheet data on the canvas creates
an editable table automatically. Pasting a rectangular range into an editor
cell expands the grid as needed. Chinese, empty cells, quoted tabs and
multiline Excel values are preserved; ordinary prose stays ordinary text.
Merged HTML cells retain their row/column spans. Formula strings are displayed
as text, not calculated.

Structured `customData.richTable` retains cells/styles for subsequent editing
and shared cloud reload. SVG is only the canvas/export rendering. Existing
element IDs, positions and resized display scales are retained on editing.
All tables use the current scene synchronization, private image storage and
existing free-quota guards; no new paid service is enabled. Limits are 100
rows, 30 columns and 50,000 total characters. Oversized data is rejected with
a message rather than truncated. Rendering has an additional safe pixel limit.

An hourly Codex heartbeat checks public quota status and notifies only on
meaningful warning/pause/recovery changes. This reminder requires Codex to
be available; server checks and stops run independently.
