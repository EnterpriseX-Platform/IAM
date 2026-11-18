import Keycloak from 'keycloak-js';

// Keycloak configuration from environment variables
const keycloakConfig = {
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8081',
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'iamx-realm',
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'iamx-app',
};

// Check if Keycloak is enabled
export const isKeycloakEnabled = (): boolean => {
  return process.env.NEXT_PUBLIC_KEYCLOAK_ENABLED === 'true';
};

// Create Keycloak instance
export const keycloak = new Keycloak(keycloakConfig);

// Keycloak initialization options
// Using 'check-sso' instead of 'login-required' so the app does NOT auto-redirect.
// Keycloak is only used on specific backend endpoints; the frontend login is pure JWT.
export const keycloakInitOptions = {
  onLoad: 'check-sso' as const,
  checkLoginIframe: false,
  pkceMethod: 'S256' as const,
};

// Helper function to get the Keycloak token
export const getKeycloakToken = (): string | undefined => {
  return keycloak.token;
};

// Helper function to get Authorization header
export const getAuthHeader = (): { Authorization: string } | {} => {
  const token = getKeycloakToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};

// Helper function to update Keycloak token
export const updateKeycloakToken = async (minValidity: number = 30): Promise<boolean> => {
  try {
    return await keycloak.updateToken(minValidity);
  } catch (error) {
    console.error('Failed to update Keycloak token:', error);
    return false;
  }
};

// Helper function to logout from Keycloak
export const logoutKeycloak = (): void => {
  keycloak.logout({
    redirectUri: window.location.origin,
  });
};

export default keycloak;
