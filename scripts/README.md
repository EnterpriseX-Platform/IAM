# Local dev stack

Single-command Oracle XE + iamx-api on your machine. No remote Oracle, no remote PG.

## Quick start

```bash
chmod +x scripts/*.sh
./scripts/local-up.sh        # bring up & wait healthy (~2-3 min first time)
./scripts/smoke-test.sh      # run smoke tests
./scripts/local-down.sh      # stop (data persists)
./scripts/local-down.sh --clean   # stop + wipe volumes (force re-init)
```

## What's running

| Service | Image | Port | Notes |
|---|---|---|---|
| `iamx-oracle-local` | `gvenzl/oracle-xe:21-slim-faststart` | `1521` | Schemas: `IAMX`, `APP`. Service: `XEPDB1` |
| `iamx-api-local` | built from `api/Dockerfile` | `8080` | Points at local Oracle |

## Init order (Oracle)

Files mounted into `/container-entrypoint-initdb.d/` run alphabetically as SYSDBA in PDB:

1. `01_setup.sql` — create users `IAMX` / `APP`, M_AGC stub, `IAMX.ADMIN` for legacy admin login
2. `02_iamx_v2.sql` — main DDL (`api/schema/oracle/iamx_v2.sql` — symlinked, single source)
3. `03_seed.sql` — minimal RBAC seed: 1 domain → 1 app → 1 module → 3 objects, 1 role, 1 user

## Connect to Oracle from host

```bash
# sqlplus / sqldeveloper / dbeaver
host:    localhost
port:    1521
service: XEPDB1
user:    IAMX
pass:    iamxpw
```

Or shell into the container:

```bash
docker exec -it iamx-oracle-local sqlplus IAMX/iamxpw@//localhost:1521/XEPDB1
```

## Caveats

- **PG-dependent endpoints (`/directory/*`, `/public/me/*`)** still hit Postgres in this branch.
  They return 500 in local until Phase 3 handler rewrite. Smoke tests cover only the
  Oracle-backed paths + the new gap endpoints (which still go to PG via existing handlers
  — these will be rewritten next).
- **Keycloak URL** points at production iam.example.com — required for API startup
  validation. JWKS fetch only happens for `/public/me/*` so other endpoints work offline.
- **JWT_SECRET** is a non-prod placeholder; do not use this `docker-compose.local.yml` outside dev.
