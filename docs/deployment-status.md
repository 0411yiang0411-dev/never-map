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
- Production version: 220ed463-0f0b-4dfa-801c-119903b0307f.
- Usage policy: 90% warning, 99% cloud stop; verification hourly, expires
  after two hours; unknown/month rollover fails closed. Counters never lower.
- Codex hourly heartbeat `never-map` created ACTIVE for warning/pause/recovery
  changes. Reminder requires desktop app availability; server checks/stops
  run independently.
- HTTPS verification at 2026-10-10 22:57 Asia/Shanghai: public assets, config,
  quota, image upload/exact-byte reload, D1 save/reload, blank initial canvas
  and public quota endpoint passed. `.cache/live-verification.json` has proof.
- Fourteen local backend/quota tests passed.
- Final production checks also passed: unauthorized scene requests rejected,
  repeated fresh quota verification makes no extra R2 requests, blank canvas
  intact. Proof: `.cache/final-check.json`.
- Browser control: tab inventory is available; page DOM and screenshot calls
  time out. No successful browser screenshot or token edit is claimed.

Personal access key: `.cache/access-key.txt`, restricted to Administrator and
SYSTEM. API token is not stored in project files; monitor and access keys are
Cloudflare Worker secrets. Keep secrets out of Git and R2 private.
