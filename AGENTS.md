# never-map

This project is independent from byfloral.com. Do not use Byfloral's directory,
server, credentials or deployment configuration.

All configurable caches, temporary files, downloads and build outputs belong
inside this project: .cache/, .tmp/, node_modules/, dist/. Run
scripts/project-env.cmd before developer commands on this Windows host.

Never commit secrets or include them in logs. Cloudflare API credentials must
not be bundled into client JavaScript. R2 buckets must remain private with no
public r2.dev/custom-domain bypass. Only the authenticated Worker may access R2.

Remain on Workers Free. Do not enable paid plans, AI, image transformations,
Infrequent Access storage or multiplayer services. The user authorized a
persistent capability-based shared editing link on 2026-10-10. Keep its token
in Worker secrets and local private cache, never in Git or static assets.

User requires warnings when 10% of free R2 quota remains, and pausing before
exceeding any quota. Warn at 90%, stop at 99%. Reserve usage atomically BEFORE
every R2 request, count failures conservatively, and keep cloud access paused
when quota/month/account baseline is unknown. Never reset storage accounting
on month rollover. R2's account-level quota is shared; project counters are
not a provider-enforced account spending cap.

Before deploying: build frontend, bundle Worker, run quota and Worker tests,
verify account permissions, free plan and account-wide R2 usage. Do not claim
deployment until the deployed URL and saving/reloading have been verified.

Access recovery (2026-10-29): the primary frontend is now
https://never-map-0411yiang0411.pages.dev/ . The user confirmed this entry opens;
the original workers.dev address continued returning ERR_FAILED on their devices
even after a rollback. Pages forwards /api/* through a service binding to the
existing never-map Worker, preserving D1/R2/authentication/quota guards. Frontend
deployment must update Pages (see docs/access-entries.md), not only run the root
Worker deploy command. Explicit Pages mode is required to avoid Wrangler's
automatic Pages-to-Workers delegation. No paid plan was enabled.

Android v1.0.8 uses the Pages entry and has an alternate-entry fallback. Local
browser storage is origin-specific; never clear old app/site data as a fix.
Private recovery exports live in ignored output/recovery/, with full cloud
backups under .cache/backups/. Never publish these files. Initial empty devices
must read existing cloud content before uploading; keep that recovery guard.
