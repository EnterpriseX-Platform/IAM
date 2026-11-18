#!/usr/bin/env bash
# ============================================================
# Local dev — smoke tests
# Hits each Oracle-backed endpoint added/changed in this branch.
# Passes if every assertion is met; exits non-zero on first fail.
# ============================================================
set -euo pipefail

BASE="${BASE:-http://localhost:8081/iamx/api}"
PASS=0
FAIL=0

ok()   { printf "  ✓ %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  ✗ %s\n" "$1"; printf "    %s\n" "$2"; FAIL=$((FAIL+1)); }

assert_status() {
    local label="$1" url="$2" expect="$3" method="${4:-GET}" body="${5:-}"
    local args=(-s -o /tmp/sm-body -w '%{http_code}' -X "$method" "$url")
    if [[ -n "$body" ]]; then args+=(-H 'Content-Type: application/json' -d "$body"); fi
    local code; code=$(curl "${args[@]}")
    if [[ "$code" == "$expect" ]]; then ok "$label ($method $url → $code)"
    else fail "$label ($method $url → $code, expect $expect)" "$(head -c 200 /tmp/sm-body)"
    fi
}

assert_jq() {
    local label="$1" url="$2" jq_expr="$3" expect="$4"
    local got; got=$(curl -sf "$url" | jq -r "$jq_expr" 2>/dev/null || echo "ERROR")
    if [[ "$got" == "$expect" ]]; then ok "$label ($jq_expr = $expect)"
    else fail "$label ($jq_expr = '$got', expect '$expect')" ""
    fi
}

echo "=== Oracle-only (IAMX schema) ==="
assert_jq    "health: database connected" "$BASE/health" '.database' 'connected'

# admin login (V1 IAMX.ADMIN, Oracle)
assert_status "login admin/admin1234" "$BASE/auth/login" 200 POST '{"username":"admin","password":"admin1234"}'

echo ""
echo "=== Gap endpoints — permission_type CRUD ==="
# Create a permission type, ensure id returned
NEW_PT=$(curl -sf -X POST -H 'Content-Type: application/json' \
    -d '{"permission_type":"SHARE","permission_type_group":"DATA_ACCESS","description":"แชร์ข้อมูล"}' \
    "$BASE/directory/permission-types")
PT_ID=$(echo "$NEW_PT" | jq -r '.id // empty')
if [[ -n "$PT_ID" ]]; then ok "POST /directory/permission-types → id=$PT_ID"
else fail "POST /directory/permission-types → no id" "$NEW_PT"; fi

# Update it
assert_status "PUT /directory/permission-types/$PT_ID" \
    "$BASE/directory/permission-types/$PT_ID" 200 PUT \
    '{"permission_type":"SHARE","permission_type_group":"DATA_ACCESS","description":"แชร์ข้อมูล (updated)"}'

# Soft delete
assert_status "DELETE /directory/permission-types/$PT_ID" "$BASE/directory/permission-types/$PT_ID" 200 DELETE

echo ""
echo "=== Gap endpoints — applications flat list ==="
assert_status "GET /directory/applications (flat)" "$BASE/directory/applications" 200
# Pick first existing id from the flat list (PG-imported ids may not start at 1)
APP_ID=$(curl -sf "$BASE/directory/applications" | jq -r '.data[0].id // empty')
if [[ -n "$APP_ID" ]]; then
    assert_status "GET /directory/applications/$APP_ID" "$BASE/directory/applications/$APP_ID" 200
else
    fail "no application rows to GET" ""
fi
assert_status "GET /directory/applications/9999999 (404)" "$BASE/directory/applications/9999999" 404

echo ""
echo "=== Gap endpoints — object move + filter ==="
assert_status "GET /directory/objects (flat)" "$BASE/directory/objects" 200
assert_status "GET /directory/objects?type=MENU" "$BASE/directory/objects?type=MENU" 200
# Pick a leaf object (has parent_id) and move it to root by setting new_parent_id=null
LEAF_ID=$(curl -sf "$BASE/directory/objects" | jq -r '[.data[] | select(.parent_id != null)] | .[0].id // empty')
if [[ -n "$LEAF_ID" ]]; then
    assert_status "POST /directory/objects/$LEAF_ID/move (to root)" "$BASE/directory/objects/$LEAF_ID/move" 200 POST '{"new_parent_id":null}'
else
    fail "no leaf objects available to move" ""
fi

echo ""
echo "=========================================="
printf "  Passed: %d   Failed: %d\n" "$PASS" "$FAIL"
echo "=========================================="
[[ "$FAIL" -eq 0 ]]
