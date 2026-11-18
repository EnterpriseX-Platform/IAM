#!/bin/bash
# Run DDL + seed as the IAMX user so tables are owned by IAMX.
# (SYSDBA-run scripts create objects under SYSTEM even with ALTER SESSION
# SET CURRENT_SCHEMA, which only affects name resolution, not ownership.)
set -e

echo "→ running iamx.sql as IAMX user…"
sqlplus -S IAMX/iamxpw@//localhost:1521/XEPDB1 <<'EOF'
WHENEVER SQLERROR EXIT FAILURE
@/sql/iamx.sql
@/sql/iamx_seed.sql
EXIT;
EOF
echo "→ DDL + seed loaded into IAMX schema"
