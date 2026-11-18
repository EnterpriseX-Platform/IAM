#!/usr/bin/env bash
# ============================================================
# Local dev — bring up stack and wait until ready
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ docker compose up -d"
docker compose -f docker-compose.local.yml up -d --build

echo "→ waiting for Oracle to be healthy (first start = ~2-3 min)…"
for i in {1..60}; do
    status=$(docker inspect --format='{{.State.Health.Status}}' iamx-oracle-local 2>/dev/null || echo "starting")
    if [[ "$status" == "healthy" ]]; then
        echo "  ✓ Oracle healthy"
        break
    fi
    sleep 10
    echo -n "."
done

if [[ "$status" != "healthy" ]]; then
    echo "  ✗ Oracle did not become healthy in 10 min — check 'docker compose logs oracle'"
    exit 1
fi

echo "→ waiting for iamx-api to start…"
for i in {1..30}; do
    if curl -sf http://localhost:8081/iamx/api/health >/dev/null 2>&1; then
        echo "  ✓ iamx-api up"
        break
    fi
    sleep 2
    echo -n "."
done

echo ""
echo "Stack ready:"
echo "  Oracle:    localhost:1521  (user IAMX / iamxpw, service XEPDB1)"
echo "  API:       http://localhost:8081/iamx/api"
echo ""
echo "Try:"
echo "  ./scripts/smoke-test.sh"
echo "  curl http://localhost:8080/iamx/api/health"
echo "  docker compose -f docker-compose.local.yml logs -f iamx-api"
