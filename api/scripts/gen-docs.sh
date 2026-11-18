#!/usr/bin/env bash
# Regenerate the OpenAPI / Swagger spec from handler annotations.
#
# Run this whenever a handler comment with @Router / @Summary / @Tags changes,
# or whenever you add annotations to a new handler. The output (docs/docs.go,
# docs/swagger.json, docs/swagger.yaml) is COMMITTED to the repo so the
# Dockerfile build doesn't need a swag step.
#
# Requires: swag CLI on $PATH (or ~/go/bin/swag).
#   go install github.com/swaggo/swag/cmd/swag@latest
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v swag >/dev/null 2>&1; then
    SWAG=swag
elif [ -x "$HOME/go/bin/swag" ]; then
    SWAG="$HOME/go/bin/swag"
else
    echo "✗ swag CLI not found. Install with: go install github.com/swaggo/swag/cmd/swag@latest" >&2
    exit 1
fi

echo "→ regenerating OpenAPI spec via $SWAG"
"$SWAG" init -g main.go -o ./docs --parseInternal
echo "✓ docs/{docs.go,swagger.json,swagger.yaml} updated"
echo ""
echo "  Reload Swagger UI: http://localhost:8081/iamx/api/docs/index.html"
