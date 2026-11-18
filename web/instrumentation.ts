export async function register() {
  const api = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8080 (default)';
  const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? '(not set)';
  const keycloakRealm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? '(not set)';
  const keycloakClient = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? '(not set)';
  const keycloakEnabled = process.env.NEXT_PUBLIC_KEYCLOAK_ENABLED ?? '(not set)';
  const debug = process.env.NEXT_PUBLIC_DEBUG ?? '(not set)';
  const env = process.env.NODE_ENV;

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║         iamx Web — Startup Config        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  NODE_ENV              : ${env}`);
  console.log(`  NEXT_PUBLIC_API_BASE  : ${api}`);
  console.log('  ── Keycloak ──────────────────────────────');
  console.log(`  KEYCLOAK_ENABLED      : ${keycloakEnabled}`);
  console.log(`  KEYCLOAK_URL          : ${keycloakUrl}`);
  console.log(`  KEYCLOAK_REALM        : ${keycloakRealm}`);
  console.log(`  KEYCLOAK_CLIENT_ID    : ${keycloakClient}`);
  console.log('  ── Feature Flags ─────────────────────────');
  console.log(`  NEXT_PUBLIC_DEBUG     : ${debug}`);
  console.log('══════════════════════════════════════════════');
  console.log('');
}
