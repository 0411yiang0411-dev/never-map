# Access entries

The original workers.dev entry reported `net::ERR_FAILED` on Android and web.
Rolling back to Worker version 90d43394-bb98-4093-81bd-5bad0c2e30a3 did not
resolve the user's failure. HTTP requests through the development proxy returned
200 for the previous HTML, entry JavaScript and diagnostics, while the in-app
browser could not complete navigation. This does not establish the exact ISP,
DNS, browser or Cloudflare cause. Do not label the user's connection restored
based solely on proxy HTTP checks.

The additional entry is https://never-map-0411yiang0411.pages.dev/ . Build with
the existing `pnpm build`, then `node scripts/prepare-pages.mjs`. Pages config
lives in `deploy/pages/wrangler.jsonc`. Deploy from that directory using
`wrangler pages deploy ../../.tmp/pages --project-name never-map-0411yiang0411
--branch main --force`. The explicit Pages mode is intentional: Wrangler's
automatic Pages-to-Workers delegation would reuse the blocked domain family.
Never silently substitute another workers.dev site for this Pages entry.

Only /api/* invokes the Pages function. It forwards the original request to
the existing never-map Worker through a service binding. D1, private R2,
authentication, revision checks and quota guards remain authoritative there.
There are no additional credentials in static assets, no R2 public access and
no new database or bucket. Other requests use static Pages hosting. Keep both
projects on their free plans; do not upgrade to address access errors.

Android trusts only these two exact HTTPS origins. The Pages origin is the new
default, with a single automatic alternate attempt after a main-frame network
failure or startup timeout. Explicit menu actions can switch entries. SSL
validation is retained; untrusted origins never receive the native bridge.

Browser/Android local storage is origin-specific. The new entry uses the same
cloud canvases after login, but cannot silently read the original origin's
IndexedDB. Old local caches are preserved; do not clear app/site storage or
uninstall as a troubleshooting step, especially with unsynchronized edits.

Fresh blank devices always read an existing nonempty cloud scene before any
upload. Theme defaults are normalized so initial editor setup does not turn a
blank page into a conflicting local edit. A completed canvas load automatically
fits content when no meaningful saved local viewport exists. Local viewport
coordinates are saved independently of cloud content, and the main menu offers
`定位全部内容` for explicit recovery of an offscreen canvas. The lasso is an
icon-only control inside the central native toolbar.

`/refresh.html` updates the static shell and then opens the editor without
deleting IndexedDB, credentials, local canvas data or pending uploads.
