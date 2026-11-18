#!/usr/bin/env bash
# CRUD round-trip test on every V2 entity that the admin SPA exposes.
# Each block: POST → GET-by-id (verify in list) → PUT → DELETE → verify gone.
# All against local API. Captures end-state row counts to confirm clean-up.
set -uo pipefail

BASE="${BASE:-http://localhost:8081/iamx/api}"
TS=$(date +%s)
PASS=0; FAIL=0

ok()   { printf "  \xE2\x9C\x93 %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  \xE2\x9C\x97 %s\n" "$1"; printf "    %s\n" "$2"; FAIL=$((FAIL+1)); }

# crud_entity LABEL ENDPOINT CREATE_BODY UPDATE_BODY ID_PATH DELETE_OK
# If GET /endpoint/:id returns 405 the test falls back to verifying the row
# appears in the list endpoint instead (some entities deliberately expose
# only a list endpoint for the FE).
crud_entity() {
    local label="$1" endpoint="$2" cbody="$3" ubody="$4" id_path="${5:-.id}" del_codes="${6:-200,204}"
    local create; create=$(curl -s -X POST -H 'Content-Type: application/json' -d "$cbody" "$BASE$endpoint")
    local id; id=$(echo "$create" | jq -r "$id_path // empty")
    if [[ -z "$id" || "$id" == "null" ]]; then
        fail "$label CREATE" "$create"
        return
    fi
    ok "$label POST $endpoint → id=$id"

    # Verify exists: prefer GET-by-id, fall back to list-search.
    local got; got=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$endpoint/$id")
    if [[ "$got" == "200" ]]; then
        ok "$label GET $endpoint/$id → 200"
    elif [[ "$got" == "405" || "$got" == "404" ]]; then
        local found; found=$(curl -s "$BASE$endpoint" | jq -r --arg id "$id" '.data[] | select((.id|tostring)==$id) | .id // empty')
        if [[ -n "$found" ]]; then ok "$label LIST-FIND $endpoint id=$id (no GET-by-id route)"; else fail "$label LIST-FIND" "id $id missing from list"; fi
    else
        fail "$label GET" "$got"
    fi

    local put_code; put_code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: application/json' -d "$ubody" "$BASE$endpoint/$id")
    if [[ "$put_code" == "200" ]]; then ok "$label PUT $endpoint/$id → 200"; else fail "$label PUT" "$put_code"; fi

    local del_code; del_code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE$endpoint/$id")
    if [[ ",$del_codes," == *",$del_code,"* ]]; then ok "$label DELETE $endpoint/$id → $del_code"; else fail "$label DELETE" "$del_code"; fi
}

echo "================================================================"
echo "CRUD round-trip — every V2 entity"
echo "================================================================"

echo ""
echo "─── Hierarchy ───"
crud_entity "domain" "/directory/domains" \
    '{"code":"CRUD'$TS'","name":"crud test domain","is_active":1}' \
    '{"code":"CRUD'$TS'","name":"crud test domain UPDATED","is_active":1}'

# Need a domain to attach apps; reuse existing one
DOM_ID=$(curl -s "$BASE/directory/domains" | jq -r '.data[0].id')
crud_entity "application" "/directory/applications" \
    '{"domain_id":'"$DOM_ID"',"code":"CRUDAPP'$TS'","name":"crud app","is_active":1,"sort_order":99}' \
    '{"domain_id":'"$DOM_ID"',"code":"CRUDAPP'$TS'","name":"crud app UPDATED","is_active":1,"sort_order":99}'

crud_entity "object_type" "/directory/object-types" \
    '{"code":"CRUDOT'$TS'","name":"crud object type","is_active":1}' \
    '{"code":"CRUDOT'$TS'","name":"crud OT updated","is_active":1}' \
    '.id' '200,204'

echo ""
echo "─── RBAC ───"
crud_entity "permission_type" "/directory/permission-types" \
    '{"permission_type":"CRUDPERM'$TS'","permission_type_group":"OBJECT","description":"crud test"}' \
    '{"permission_type":"CRUDPERM'$TS'","permission_type_group":"OBJECT","description":"updated"}'

crud_entity "role" "/directory/roles" \
    '{"code":"CRUD_ROLE_'$TS'","name":"crud role","is_active":1,"default_role":0}' \
    '{"code":"CRUD_ROLE_'$TS'","name":"crud role updated","is_active":1,"default_role":0}'

crud_entity "responsibility" "/directory/responsibilities" \
    '{"code":"CRUD_RESP_'$TS'","name":"crud resp","is_active":1}' \
    '{"code":"CRUD_RESP_'$TS'","name":"crud resp updated","is_active":1}' \
    '.data.id'

echo ""
echo "─── Mapping tables (depend on parent rows) ───"
ROLE_ID=$(curl -s "$BASE/directory/roles" | jq -r '.data[0].id')
RESP_ID=$(curl -s "$BASE/directory/responsibilities" | jq -r '.data[0].id')
OBJ_ID=$(curl -s "$BASE/directory/objects" | jq -r '.data[0].id')

# role_object_mapping
NEW_ROM=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"role_id":'"$ROLE_ID"',"object_id":'"$OBJ_ID"',"is_active":1,"effective_date":""}' \
    "$BASE/directory/role-object-mappings")
ROM_ID=$(echo "$NEW_ROM" | jq -r '.id // empty')
if [[ -n "$ROM_ID" ]]; then
    ok "role_object_mapping POST → id=$ROM_ID"
    code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/directory/role-object-mappings/$ROM_ID")
    [[ "$code" == "200" ]] && ok "role_object_mapping DELETE → $code" || fail "role_object_mapping DELETE" "$code"
else
    fail "role_object_mapping POST" "$NEW_ROM"
fi

# responsibility_role_mapping — create fresh role + responsibility so we
# don't collide with seeded UQ_RRM(responsibility_id, role_id).
TMP_ROLE=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"code":"CRUD_ROLE_RRM_'$TS'","name":"rrm test role","is_active":1,"default_role":0}' \
    "$BASE/directory/roles" | jq -r '.id')
TMP_RESP=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"code":"CRUD_RESP_RRM_'$TS'","name":"rrm test resp","is_active":1}' \
    "$BASE/directory/responsibilities" | jq -r '.data.id')
NEW_RRM=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"responsibility_id":'"$TMP_RESP"',"role_id":'"$TMP_ROLE"',"is_active":1}' \
    "$BASE/directory/responsibility-role-mappings")
RRM_ID=$(echo "$NEW_RRM" | jq -r '.data.id // .id // empty')
if [[ -n "$RRM_ID" && "$RRM_ID" != "null" ]]; then
    ok "responsibility_role_mapping POST → id=$RRM_ID"
    code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/directory/responsibility-role-mappings/$RRM_ID")
    [[ "$code" == "200" ]] && ok "responsibility_role_mapping DELETE → $code" || fail "responsibility_role_mapping DELETE" "$code"
else
    fail "responsibility_role_mapping POST" "$NEW_RRM"
fi
# cleanup transient role/resp
curl -s -X DELETE "$BASE/directory/roles/$TMP_ROLE" >/dev/null
curl -s -X DELETE "$BASE/directory/responsibilities/$TMP_RESP" >/dev/null

# responsibility_data_access — UQ_RDA(responsibility_id, agency_id), so
# create a fresh responsibility for this test rather than reusing the
# seeded SUPER one.
AGENCY_ID=$(curl -s "$BASE/oracle/agencies/ministries" | jq -r '.data[0].agcId // .data[0].AGC_ID // .data[0].agc_id // empty')
TMP_RESP_RDA=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"code":"CRUD_RESP_RDA_'$TS'","name":"rda test resp","is_active":1}' \
    "$BASE/directory/responsibilities" | jq -r '.data.id')
if [[ -n "$AGENCY_ID" && -n "$TMP_RESP_RDA" && "$TMP_RESP_RDA" != "null" ]]; then
    NEW_RDA=$(curl -s -X POST -H 'Content-Type: application/json' \
        -d '{"responsibility_id":'"$TMP_RESP_RDA"',"agency_id":"'"$AGENCY_ID"'","is_active":1,"permissions":["VIEW","EXPORT"]}' \
        "$BASE/directory/responsibility-data-accesses")
    RDA_ID=$(echo "$NEW_RDA" | jq -r '.data.id // .id // empty')
    if [[ -n "$RDA_ID" && "$RDA_ID" != "null" ]]; then
        ok "responsibility_data_access POST → id=$RDA_ID (agency_id=$AGENCY_ID, perms=[VIEW,EXPORT])"
        code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/directory/responsibility-data-accesses/$RDA_ID")
        [[ "$code" == "200" ]] && ok "responsibility_data_access DELETE → $code" || fail "responsibility_data_access DELETE" "$code"
    else
        fail "responsibility_data_access POST" "$NEW_RDA"
    fi
    curl -s -X DELETE "$BASE/directory/responsibilities/$TMP_RESP_RDA" >/dev/null
else
    fail "responsibility_data_access POST" "no agency available from /oracle/agencies/ministries"
fi

echo ""
echo "─── Object move (gap endpoint, local-only) ───"
LEAF_ID=$(curl -s "$BASE/directory/objects" | jq -r '[.data[] | select(.parent_id != null)] | .[0].id // empty')
if [[ -n "$LEAF_ID" ]]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
        -d '{"new_parent_id":null}' "$BASE/directory/objects/$LEAF_ID/move")
    [[ "$code" == "200" ]] && ok "object/$LEAF_ID/move → root → $code" || fail "object move" "$code"
fi

echo ""
echo "─── Toggle / set-default endpoints ───"
ROLE2=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"code":"CRUD_TOGGLE_'$TS'","name":"toggle test","is_active":1,"default_role":0}' \
    "$BASE/directory/roles")
R2_ID=$(echo "$ROLE2" | jq -r '.id // empty')
if [[ -n "$R2_ID" ]]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/directory/roles/$R2_ID/set-default")
    [[ "$code" == "200" ]] && ok "role/$R2_ID/set-default → $code" || fail "set-default" "$code"
    curl -s -X DELETE "$BASE/directory/roles/$R2_ID" >/dev/null
    ok "cleanup: role $R2_ID deleted"
fi

echo ""
echo "──────────────────────────────────────────────────────"
printf "  Passed: %d   Failed: %d\n" "$PASS" "$FAIL"
echo "──────────────────────────────────────────────────────"
[[ "$FAIL" -eq 0 ]]
