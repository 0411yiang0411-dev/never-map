# Canvas tools and synchronization

## UI

Canvas selection, creation, renaming, file export, PNG export, cloud tools and
the Android updater menu live in Excalidraw's MainMenu. No separate page header
is rendered. Table insertion and lasso are mounted into the native drawing
toolbar through a React portal, recreated if the responsive toolbar changes.
Existing rich text remains editable; the separate new formatted-text launcher
has been removed.

The lasso accepts mouse/stylus input and selects fully enclosed element bounds.
Groups and bound text remain selected together. Fingers retain canvas panning
and pinch zoom. A successful lasso opens the right selection panel. Alignment
actions and native resizing/endpoint snapping remain available. Group dragging
also snaps the common bounds to neighboring edges/centers at 8 screen pixels.
Ctrl/Command bypass snapping. The pinned engine's official reference is:
https://github.com/excalidraw/excalidraw/blob/v0.18.0/packages/excalidraw/snapping.ts
No third-party runtime dependency was added.

The snap flag is initialized in `initialData.appState`, not only a controlled
prop: the pinned wrapper does not forward that prop, and async scene startup
can reset an early imperative update. Browser verification confirmed the live
native flag is true, and both a rectangle and table have x=430 after dragging,
with a vertical reference guide drawn at x=430. Capture listeners are necessary
because the canvas consumes bubbling pointer events.

Pressure previews use an incremental, desynchronized canvas with at most 2x
pixel density. Only new raw/coalesced samples are painted; the complete prior
SVG is no longer rebuilt each frame. Completed native strokes preserve all
sample coordinates and pressures. Live text/table overlays reuse the native
canvas's actual computed color filter to match dark mode instead of displaying
unfiltered white surfaces. Theme changes are included in persistence signatures.

## Upload semantics

The sync icon explicitly queues the current canvas's local version as the next
cloud version. Its force-upload intent is stored in IndexedDB, survives reload,
and resumes after connectivity returns. Offline edits also queue this intent.
Cloud revision CAS is still enforced; a concurrent remote update triggers a
fresh read/retry rather than an unconditional server write.

Before forced replacement, the remote scene and immutable file references are
saved under `cloud-before-overwrite:<canvas-id>`. The cloud panel can restore
that version locally; the user then clicks sync to upload it. Automatic clean
device downloads never overwrite dirty local content. Authentication, quota and
content validation stops are not bypassed by the sync button. Both devices
editing offline are not collaboratively merged: the reconnecting device's
queued local snapshot wins, with the preceding cloud version retained locally.

## Verification

Browser fixture: localhost only, no production drawings modified. Checked
hamburger actions, header removal, toolbar insertion, dark table editing,
lasso sidebar, pressure sampling and offline forced upload against a newer
remote revision with a recoverable backup. A 600-sample synthetic pressure
stroke rendered using the incremental preview with approximately 16.7 ms median
and 18.2 ms maximum frame intervals on the development machine. This is not a
measurement of the user's physical Android tablet or its hardware input latency.
