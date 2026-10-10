# Deployment status

Date: 2026-10-10 (Asia/Shanghai)

- Local project: E:\Excalidraw, independent of Byfloral.
- Repository: https://github.com/0411yiang0411-dev/never-map
- Frontend: production build passed.
- Worker: dry-run bundle passed; SQLite-backed behavior tests passed.
- Cloudflare: supplied API token validates account/R2 access. R2 bucket list
  was empty and account R2 metrics showed zero stored objects and bytes.
- Blocker: current token lacks D1 and Workers subdomain permissions (401/403).
- Live website: NOT DEPLOYED. Cloud saving is disabled by default.
- Usage policy: 90% page warning, 99% cloud stop; unknown/month rollover fail
  closed. Off-page notification automation is not yet configured.
- Browser control: tab inventory is available; page DOM and screenshot calls
  time out. No successful browser screenshot or token edit is claimed.

Only after required permissions are granted: verify Workers Free, create
private Standard R2 bucket and D1 database, apply migration, initialize quota
from account-level monthly operation/storage evidence, configure access
secret, deploy, verify live saving and reload. Keep API tokens out of Git.
