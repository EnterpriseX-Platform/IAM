#!/usr/bin/env bash
# Bring down local stack. Add --volumes to wipe Oracle data (force re-init).
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--clean" ]]; then
    echo "→ wiping data volumes (Oracle init will re-run on next up)"
    docker compose -f docker-compose.local.yml down -v
else
    docker compose -f docker-compose.local.yml down
fi
