# Handwriting and viewport optimization

Upstream research consulted:

- https://github.com/excalidraw/excalidraw/issues/10063 discusses redundant
  viewport work, competing RAF callbacks and indexing proposals. Its projected
  30–50% improvement is a proposal, not a result for never-map.
- https://github.com/excalidraw/excalidraw/issues/8242 discusses caching and
  restricting temporary canvas work. No whole rendering-engine upgrade or
  speculative upstream PR was installed in this change.
- https://github.com/excalidraw/excalidraw/issues/7240 describes image placeholders.
  Local pinned source confirms `addFiles` starts asynchronous image-cache loading.

The previous pressure implementation committed an image at pen-up. New strokes
are native freedraw elements with a stable pressure path renderer; this removes
the image-cache dependency and the corresponding placeholder race. Old images
and files remain untouched. The build patches one renderer only and fails if
the pinned dependency layout changes; dev and production transforms are tested.

Workspace changes skip full scene fingerprints and selection scans for pure
viewport notifications. Actual in-place version mutations, background changes
and scene replacements still trigger save processing. Sidebar drag updates are
coalesced; save/sync timers and conflict detection remain intact.

Local wrapper-only benchmark: 10,000 elements × 1,000 viewport notifications;
old fingerprint creation 721.03ms, gated checks 10.24ms. Evidence is in
`.cache/scene-gate-benchmark.json`. This does not measure tablet FPS or hardware
input latency. Physical iPad interaction is not verified on this Windows host.
