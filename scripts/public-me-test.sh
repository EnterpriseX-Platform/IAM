#!/usr/bin/env bash
# Smoke test for "public" surface — read endpoints + per-user /public/me/*.
#
# What we cover:
#   1. Anonymous: /health, /auth/login (admin)
#   2. Admin-JWT-protected reads: /directory/* and /oracle/* GET endpoints
#      (currently anonymous in local stack since setupAuthMiddleware is
#      not wired — but we send the token anyway so the script keeps
#      working once auth is enabled)
#   3. Keycloak-protected: /public/me/*
#      Without KC_TOKEN env var we just verify routes respond with 401/403
#      (proving the route is wired). Set KC_TOKEN=... to send a real
#      access_token and exercise the full handler.
set -uo pipefail

BASE="${BASE:-http://localhost:8081/iamx/api}"
PASS=0; FAIL=0

ok()   { printf "  \xE2\x9C\x93 %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  \xE2\x9C\x97 %s\n" "$1"; printf "    %s\n" "$2"; FAIL=$((FAIL+1)); }

# get_code URL [TOKEN]
get_code() {
    local url="$1" tok="${2:-}"
    if [[ -n "$tok" ]]; then
        curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $tok" "$url"
    else
        curl -s -o /dev/null -w '%{http_code}' "$url"
    fi
}

# expect LABEL URL EXPECTED_CODES [TOKEN]
expect() {
    local label="$1" url="$2" expected="$3" tok="${4:-}"
    local code; code=$(get_code "$url" "$tok")
    if [[ ",$expected," == *",$code,"* ]]; then
        ok "$label $url → $code"
    else
        fail "$label $url" "got $code, expected one of $expected"
    fi
}

echo "================================================================"
echo "Public + admin API smoke test"
echo "================================================================"

echo ""
echo "─── 1. Anonymous endpoints ───"
expect "health      " "$BASE/health" "200"

# Login (admin/admin1234) — captures JWT for the protected reads
LOGIN=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"admin1234"}' \
    "$BASE/auth/login")
TOKEN=$(echo "$LOGIN" | jq -r '.data.token // .token // empty')
if [[ -n "$TOKEN" && "$TOKEN" != "null" ]]; then
    ok "auth/login admin → token (${#TOKEN} chars)"
else
    fail "auth/login" "$LOGIN"
    exit 1
fi

echo ""
echo "─── 2. Admin reads — /directory/* hierarchy ───"
expect "domains          " "$BASE/directory/domains"                "200" "$TOKEN"
expect "applications     " "$BASE/directory/applications"           "200" "$TOKEN"
expect "objects          " "$BASE/directory/objects"                "200" "$TOKEN"
expect "object-types     " "$BASE/directory/object-types"           "200" "$TOKEN"
expect "process          " "$BASE/directory/process"                "200" "$TOKEN"

echo ""
echo "─── 2b. Admin reads — /directory/* options ───"
expect "options/domains       " "$BASE/directory/options/domains"        "200" "$TOKEN"
expect "options/applications  " "$BASE/directory/options/applications"   "200" "$TOKEN"
expect "options/modules       " "$BASE/directory/options/modules"        "200" "$TOKEN"
expect "options/objects       " "$BASE/directory/options/objects"        "200" "$TOKEN"
expect "options/object-tree   " "$BASE/directory/options/object-tree"    "200" "$TOKEN"
expect "options/object-hier.  " "$BASE/directory/options/object-hierarchy" "200" "$TOKEN"
expect "options/processes     " "$BASE/directory/options/processes"      "200" "$TOKEN"
expect "options/sub-processes " "$BASE/directory/options/sub-processes"  "200" "$TOKEN"

echo ""
echo "─── 2c. Admin reads — /directory/* RBAC ───"
expect "roles               " "$BASE/directory/roles"                       "200" "$TOKEN"
expect "roles/active        " "$BASE/directory/roles/active"                "200" "$TOKEN"
expect "permission-types    " "$BASE/directory/permission-types"            "200" "$TOKEN"
expect "perm-types/groups   " "$BASE/directory/permission-types/groups"     "200" "$TOKEN"
expect "responsibilities    " "$BASE/directory/responsibilities"            "200" "$TOKEN"
expect "resp-role-mappings  " "$BASE/directory/responsibility-role-mappings" "200" "$TOKEN"
expect "resp-data-accesses  " "$BASE/directory/responsibility-data-accesses" "200" "$TOKEN"

echo ""
echo "─── 2d. Admin reads — /directory/* user mappings (require ?user_id=) ───"
expect "user-role-maps      " "$BASE/directory/user-role-mappings?user_id=1"           "200" "$TOKEN"
expect "user-resp-maps      " "$BASE/directory/user-responsibility-mappings?user_id=1" "200" "$TOKEN"
expect "user-cust-obj-maps  " "$BASE/directory/user-custom-object-mappings?user_id=1"  "200" "$TOKEN"
expect "user-cust-data-acc  " "$BASE/directory/user-custom-data-accesses?user_id=1"    "200" "$TOKEN"
# process-mappers needs module_id or object_id; pick the first object as a probe
OBJ_PROBE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/directory/objects" | jq -r '.data[0].id // empty')
if [[ -n "$OBJ_PROBE" ]]; then
    expect "process-mappers     " "$BASE/directory/process-mappers?object_id=$OBJ_PROBE" "200" "$TOKEN"
else
    fail "process-mappers" "could not probe object id"
fi

echo ""
echo "─── 3. Admin reads — /oracle/* (ERP cross-DB views) ───"
expect "agencies/ministries " "$BASE/oracle/agencies/ministries"      "200" "$TOKEN"
expect "agencies/types      " "$BASE/oracle/agencies/types"           "200,400" "$TOKEN"
expect "processes           " "$BASE/oracle/processes"                "200" "$TOKEN"
expect "fiscal-year         " "$BASE/oracle/processes/fiscal-year"    "200" "$TOKEN"
expect "ref-processes       " "$BASE/oracle/ref-processes"            "200" "$TOKEN"

# Pull a real ministry id and drill down through the children endpoint
MIN_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/oracle/agencies/ministries" | jq -r '.data[0].agcId // empty')
if [[ -n "$MIN_ID" ]]; then
    expect "agencies/children   " "$BASE/oracle/agencies/children?parent_id=$MIN_ID" "200" "$TOKEN"
fi

echo ""
echo "─── 4. Admin reads — common-data + V2 options ───"
expect "common-data-debug    " "$BASE/common-data-debug"        "200" "$TOKEN"
expect "access-type-options  " "$BASE/access-type-options"      "200" "$TOKEN"
expect "system-type-options  " "$BASE/system-type-options"      "200" "$TOKEN"
expect "object-type-options  " "$BASE/object-type-options"      "200" "$TOKEN"
expect "main-process-options " "$BASE/main-process-options"     "200" "$TOKEN"
expect "sub-process-options  " "$BASE/sub-process-options"      "200" "$TOKEN"

echo ""
echo "─── 4b. V1-legacy options (query dropped IAMX.SYSTEM/PERMISSION tables ───"
echo "         expected to 500 — these endpoints are referenced only by"
echo "         legacy SPA pages /settings/{rules,object,systemObject,manageMenu}"
echo "         which are no longer linked from the V2 navigation)"
expect "system-options [legacy]    " "$BASE/system-options"            "500" "$TOKEN"
expect "permission-options [legacy]" "$BASE/permission-options"        "500" "$TOKEN"
expect "parent-object-options [legacy]    " "$BASE/parent-object-options?systemId=1"      "500" "$TOKEN"
expect "menu-parent-obj-options [legacy]  " "$BASE/menu-parent-object-options?systemId=1" "500" "$TOKEN"

echo ""
echo "─── 5. Per-user /public/me/* ───"
KC_TOKEN="${KC_TOKEN:-}"
if [[ -z "$KC_TOKEN" ]]; then
    echo "  (no KC_TOKEN set — verifying routes respond with 401/403, set KC_TOKEN=... for full test)"
    expect "/public/me            " "$BASE/public/me/"            "401,403"
    expect "/public/me/bootstrap  " "$BASE/public/me/bootstrap"   "401,403"
    expect "/public/me/menu       " "$BASE/public/me/menu"        "401,403"
    expect "/public/me/domains    " "$BASE/public/me/domains"     "401,403"
    expect "/public/me/roles      " "$BASE/public/me/roles"       "401,403"
    expect "/public/me/permissions" "$BASE/public/me/permissions" "401,403"
else
    expect "/public/me            " "$BASE/public/me/"            "200" "$KC_TOKEN"
    expect "/public/me/bootstrap  " "$BASE/public/me/bootstrap"   "200" "$KC_TOKEN"
    expect "/public/me/menu       " "$BASE/public/me/menu"        "200" "$KC_TOKEN"
    expect "/public/me/domains    " "$BASE/public/me/domains"     "200" "$KC_TOKEN"
    expect "/public/me/roles      " "$BASE/public/me/roles"       "200" "$KC_TOKEN"
    expect "/public/me/permissions" "$BASE/public/me/permissions" "200" "$KC_TOKEN"
fi

echo ""
echo "──────────────────────────────────────────────────────"
printf "  Passed: %d   Failed: %d\n" "$PASS" "$FAIL"
echo "──────────────────────────────────────────────────────"
[[ "$FAIL" -eq 0 ]]
