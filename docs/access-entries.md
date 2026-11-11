# Access entries

As of 2026-11-11, both the original Workers URL and Pages must serve the same
full editor on desktop and mobile. `pnpm deploy` builds once and deploys both
entries with `scripts/deploy-entries.mjs`. Verify both public HTML entry assets,
offline shell, and a disposable cloud canvas after deployment. A failed second
deployment is partial success only; rerun with the same build and verify parity.
Android-only native update controls are the sole platform-specific menu items.

2026-11-11 verification: Worker version
`4a69ab82-9393-487c-a037-dd3dde8595aa` and Pages deployment `675301c9`
serve identical entry JS/CSS, offline shell and refresh page. 75 automated tests
pass. A disposable canvas saved through Workers was read through Pages, then
its element deletion through Pages was read through Workers. Main scene stayed
at revision 266 unchanged during this check. Desktop localhost testing (without
Android mode) confirmed canvas menu, in-place table editing, icon-only lasso
selection and automatic right sidebar. HTTP asset checks pass through the
development proxy, but the in-app browser still reports `net::ERR_FAILED` at
the Workers origin. Frontend parity does not establish resolved connectivity.
Verification report: `.cache/web-parity-verification.json`; desktop screenshots:
`.cache/web-parity/`. Never include private canvas recovery exports in releases.

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

## Redirected offline-shell recovery (2026-11-11)

Both hosts redirect `/index.html` to `/`. Caching that redirected Response and
returning it unchanged to a navigation whose redirect mode is manual can cause
Chromium ERR_FAILED. The shell now reconstructs redirected responses during
installation and when serving older cached HTML; failed cache access falls
back to the network. Shell version hashing includes the worker template as well
as HTML so shell-only fixes receive their own cache. No private data is cleared.
77 tests pass, including redirected install/legacy cache regressions. A real
browser fixture with the same index redirect opens on reload and offline, with
an active service worker and non-redirected cached HTML.

Deployed Worker `ed645b29-ce4f-40e6-af85-cbc73c496cf2`, Pages `b5173482`.
Both live shells match dist; main revision 266 and scene hashes match across
entries. Report `.cache/shell-fix/live-verification.json`. Browser navigation via
Pages refresh reached the editor URL/title after the repair, but the browser
automation snapshot timed out; do not claim a complete production interaction
test from that title alone.

A separate transport issue remains for the original Workers hostname on this
development machine: system DNS returned 159.106.121.75 and TLS timed out;
Cloudflare DNS-over-HTTPS returned 104.21.12.178 / 172.67.195.43. Pages resolved
consistently and direct TLS succeeded. This does not establish the user's DNS
settings, and a shell repair cannot correct external DNS responses. Prefer the
Pages refresh entry for recovery; do not alter system DNS/hosts or other
projects' domains as a silent workaround.
