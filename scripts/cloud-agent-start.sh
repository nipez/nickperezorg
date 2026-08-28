#!/usr/bin/env bash
set -euo pipefail

# Per-boot preview for the static site. Idempotent: reuse a live server if present.
if curl -sf --max-time 2 "http://127.0.0.1:8787/" >/dev/null; then
  echo "wrangler already serving on :8787"
  exit 0
fi

cd /workspace
exec npx wrangler dev --ip 0.0.0.0 --port 8787 --local
