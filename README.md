# IAMX — Identity & Access Management

IAMX manages users, roles, menu permissions and responsibilities for a group of web applications, on top of Keycloak.

- **api/** — Go (Fiber) + Oracle. Admin API under `/iamx/api/admin/*`, directory API under `/iamx/api/directory/*`, user self-service under `/iamx/api/public/me/*`.
- **web/** — Next.js admin console built with [Carbon](https://github.com/carbon-design-system/carbon) (`@carbon/react`), light/dark themes, English UI (Thai strings kept as keys).
- **keycloak-mapper/** — Keycloak protocol mapper that puts IAMX user info and roles into tokens.
- **keycloak-pending-gate/** — Keycloak authenticator that blocks sign-in while a registration is pending approval.

## Features
- Users, roles, responsibilities, menu structure (domain → application → module → menu)
- Role and responsibility groups, user types — all configurable in System settings
- Admin levels: admin · access manager · auditor
- Activity log (changes, sign-ins, menu usage) with 1-year retention
- Sign-in lockout, token revocation on sign-out, CORS allowlist, security headers

## Run locally
```bash
cp api/.env.example api/.env      # fill in Oracle, Keycloak and JWT_SECRET
cp web/.env.example web/.env.local
./scripts/local-up.sh             # Oracle XE + API
cd web && npm install && npm run dev
```
Database scripts: `api/schema/oracle/` and `api/oracle/`.
