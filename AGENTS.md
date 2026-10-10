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
