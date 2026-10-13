# Deployment status

Date: 2026-10-10 (Asia/Shanghai)

- Local project: E:\Excalidraw, independent of Byfloral.
- Repository: https://github.com/0411yiang0411-dev/never-map
- Frontend: production build passed.
- Worker: dry-run bundle passed; SQLite-backed behavior tests passed.
- Cloudflare: supplied API token validates account/R2 access. R2 bucket list
  was empty and account R2 metrics showed zero stored objects and bytes.
- Replacement token verified; Workers, D1, R2, analytics and subscription
  access succeeded. No Workers paid subscription was present. Existing R2
  subscription has $0 base and usage charges beyond free allowances.
- Live website: https://never-map.never-map-0411yiang0411.workers.dev
- D1: never-map-db; R2: never-map-images, Standard storage, private.
- Production version: e8ef4436-4d72-4c6e-b57c-3fa32a2a79bb.
- Usage policy: 90% warning, 99% cloud stop; verification hourly, expires
  after two hours; unknown/month rollover fails closed. Counters never lower.
- Codex hourly heartbeat `never-map` created ACTIVE for warning/pause/recovery
  changes. Reminder requires desktop app availability; server checks/stops
  run independently.
- HTTPS verification at 2026-10-10 22:57 Asia/Shanghai: public assets, config,
  quota, image upload/exact-byte reload, D1 save/reload, blank initial canvas
  and public quota endpoint passed. `.cache/live-verification.json` has proof.
- Sixteen local backend/quota tests passed, including shared authentication,
  password changes preserving the shared link, and quota stops for sharing.
- Personal password changed at the user's request, exclusively in Worker
  secrets and private local cache, never source code. Separate persistent
  shared-link credential configured. Connection progress and copy-link UI
  deployed; shared entry automatically loads the same cloud scene.
- Formatted-text extension: highlight, bold, underline, rules, bullets,
  numbered lists and interactive todo checkboxes. Twenty-one backend/layout
  tests pass, including structured-note roundtrip via shared access. Published
  JavaScript/CSS and exact-byte private SVG storage verified over HTTPS.
  Existing user canvas was not changed by the formatting deployment checks.
  Visual browser interaction remains unverified due the earlier control issue.
- 2026-10-11: multi-canvas workspace deployed. Create/rename and independent
  scene storage implemented; original `main` scene stays in the existing table.
  Content upload timer and idle download polling are both 5 seconds. Login
  auto-loads the cloud canvas; caches, pending flags and recovery are per-canvas.
- Twenty-six local tests pass. Live independent-client API checks passed:
  create/rename, isolation, changes/deletions, revision conflicts, per-canvas
  sharing, unchanged-revision 204 responses and legacy main compatibility.
  Proof: `.cache/multi-canvas-verification.json`. Existing user scene was never
  written by these tests. Disposable test canvas cleanup is bounded by exact
  created IDs, names and expected revisions; no existing canvas is deleted.
- 2026-10-11: requested direct formatting integration replaces the modal flow.
  Buttons are portaled into the selected-shape `.panelColumn` in the left
  sidebar. Native character selections are captured and converted in place;
  subsequent inline edits save automatically. Bottom formatting launcher no
  longer renders. Twenty-nine data/layout/selection tests pass; production
  asset checks recorded in `.cache/sidebar-assets-verification.json`.
  The browser-control connection timed out on this turn, so live clicking and
  screenshot verification are not claimed.
- 2026-10-12: editable tables deployed: insert, edit cells, add/delete rows
  and columns, header, cell bold/highlight/alignment, column width/font size,
  TSV copy/export, HTML/Excel paste conversion, rectangular cell-range paste.
  Public Excalidraw onPaste hook and capture fallback share event deduplication.
  Cells/styles remain structured in richTable metadata and preserve display
  scaling when reopened. Thirty-six model/backend/quota tests pass, including
  multiline/quoted/empty Excel cells and shared cloud table metadata roundtrip.
  Live assets and healthy quota verified without changing user canvases;
  `.cache/table-verification.json` holds the result. Browser clipboard/visual
  interaction was not verified; previous browser control remains unavailable.
- Final production checks also passed: unauthorized scene requests rejected,
  repeated fresh quota verification makes no extra R2 requests, blank canvas
  intact. Proof: `.cache/final-check.json`.
- 2026-10-12: table editing now happens directly on the canvas, with no modal.
  Left sidebar controls provide merge/unmerge, alignment, bold, highlight,
  row/column insertion and deletion, and individual widths/heights. Canvas
  boundary dragging and range selection are implemented. Merged cells preserve
  underlying values; clipboard HTML spans and cloud metadata retain merges.
  Forty tests, production build and Worker dry-run passed. Live inline editor,
  sidebar/resize assets and healthy quota verified read-only, without changing
  user canvases. Browser interaction remains visually unverified.
- Browser control: tab inventory is available; page DOM and screenshot calls
  time out. No successful browser screenshot or token edit is claimed.
- 2026-10-12: fixed inline table navigation interception. Wheel/trackpad pan,
  Shift-wheel horizontal pan, cursor-centered Ctrl/Command-wheel zoom and
  middle-button dragging now work during table editing. Range selection uses
  transformed geometry rather than DOM hits and continuously pans at viewport
  edges to reach offscreen cells. Pointer release/cancel/blur stops the gesture.
  Forty-three tests, frontend build and Worker dry-run passed. Account plan
  and healthy quota checked before deployment; published navigation assets
  verified over HTTPS. Existing scene contents were not modified. Browser tab
  binding timed out again; actual drag/scroll interaction remains unverified.

Personal access key: `.cache/access-key.txt`, restricted to Administrator and
SYSTEM. API token is not stored in project files; monitor and access keys are
Cloudflare Worker secrets. Keep secrets out of Git and R2 private.

- 2026-10-12: automatic alignment defaults on, with a toolbar toggle, Alt+S
  and browser-persisted preference. Native object snapping covers moving,
  resizing and shape creation with guides. Straight line/unbound arrow endpoint
  editing additionally snaps to endpoint and object-edge/center references.
  Ctrl/Command bypasses snapping; Shift constraints, existing bindings and
  elbow routing retain native behavior. Tests verify zoom tolerance and rotated
  endpoint edits preserving other world coordinates. Forty-five tests, frontend
  build and Worker dry-run pass. Backend and existing canvas data are unchanged.
  Deployed alignment controls/preference assets and healthy quota verified
  over HTTPS. Actual browser dragging remains unverified due the existing
  browser-control timeout.
- 2026-10-13: device-aware pointer routing added. Finger contact pans the
  canvas; two contacts zoom about their midpoint while panning. Stylus contact
  writes native freedraw strokes immediately without the engine's initial
  drag threshold. Coalesced movement and down/up positions are retained, the
  live tip is committed each frame, and zero lift pressure does not erase the
  tail. Palm contacts are suppressed until lifted. Toolbar and mouse input
  remain separate; existing cloud sync and quota guards are unchanged.
  Forty-seven tests and production build pass. Real stylus hardware latency
  and physical multi-touch interaction have not been tested on this host.
