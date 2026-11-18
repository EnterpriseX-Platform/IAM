package config

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/coreos/go-oidc/v3/oidc"
)

// KeycloakConfig holds Keycloak configuration
type KeycloakConfig struct {
	URL   string
	Realm string
	// ClientID is the audience that incoming JWTs must include in their
	// "aud" claim. Kept for backward compatibility with single-tenant
	// callers (the legacy /iamx/api/login flow that portal uses).
	ClientID string
	// ClientIDs is the multi-tenant variant — every audience listed here
	// is accepted. iamx-api is hit by both portal (`aud=portal`) and
	// the iamx-web admin SPA (`aud=iamx-web`); without a list one of
	// the two always 401s. Set via KEYCLOAK_CLIENT_IDS as a comma- or
	// whitespace-separated string. ClientID is added implicitly so old
	// configs keep working.
	ClientIDs    []string
	ClientSecret string
	Enabled      bool
}

// KeycloakProvider wraps the OIDC provider and verifier
type KeycloakProvider struct {
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	config   *KeycloakConfig
}

var (
	keycloakProvider *KeycloakProvider
	keycloakMu       sync.Mutex
)

// LoadKeycloakConfig loads Keycloak configuration from environment variables
func LoadKeycloakConfig() *KeycloakConfig {
	clientID := getEnv("KEYCLOAK_CLIENT_ID", "")
	clientIDs := parseClientIDs(getEnv("KEYCLOAK_CLIENT_IDS", ""))
	if clientID != "" {
		// Make sure the legacy single-value env still ends up in the
		// allow-list — operators upgrading from the old pattern shouldn't
		// have to change two env vars at once.
		if !contains(clientIDs, clientID) {
			clientIDs = append(clientIDs, clientID)
		}
	}
	return &KeycloakConfig{
		URL:          getEnv("KEYCLOAK_URL", ""),
		Realm:        getEnv("KEYCLOAK_REALM", ""),
		ClientID:     clientID,
		ClientIDs:    clientIDs,
		ClientSecret: getEnv("KEYCLOAK_CLIENT_SECRET", ""),
		Enabled:      getEnv("KEYCLOAK_ENABLED", "false") == "true",
	}
}

// parseClientIDs splits "portal, iamx-web" into ["portal","iamx-web"],
// tolerating commas, whitespace, or both as separators.
func parseClientIDs(raw string) []string {
	if raw == "" {
		return nil
	}
	out := []string{}
	for _, part := range strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == ' ' || r == '\t' || r == '\n'
	}) {
		s := strings.TrimSpace(part)
		if s != "" && !contains(out, s) {
			out = append(out, s)
		}
	}
	return out
}

func contains(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}

// GetKeycloakProvider returns the singleton Keycloak provider instance
func GetKeycloakProvider() (*KeycloakProvider, error) {
	config := LoadKeycloakConfig()

	if !config.Enabled {
		return nil, fmt.Errorf("Keycloak is not enabled")
	}

	keycloakMu.Lock()
	defer keycloakMu.Unlock()

	if keycloakProvider != nil {
		return keycloakProvider, nil
	}

	provider, err := newKeycloakProvider(config)
	if err != nil {
		return nil, err
	}
	keycloakProvider = provider
	return keycloakProvider, nil
}

// newKeycloakProvider creates a new Keycloak provider
func newKeycloakProvider(config *KeycloakConfig) (*KeycloakProvider, error) {
	issuerURL := fmt.Sprintf("%s/realms/%s", config.URL, config.Realm)

	ctx := context.Background()
	provider, err := oidc.NewProvider(ctx, issuerURL)
	if err != nil {
		return nil, fmt.Errorf("failed to create OIDC provider: %w", err)
	}

	// When more than one client ID is allowed (multi-tenant — portal +
	// iamx-web both call this API), let the OIDC lib skip its own aud
	// check and validate manually in VerifyToken instead. The lib only
	// supports a single ClientID; using SkipClientIDCheck and rolling
	// our own keeps signature/expiry/issuer verification intact.
	cfg := &oidc.Config{ClientID: config.ClientID}
	if len(config.ClientIDs) > 1 {
		cfg.SkipClientIDCheck = true
	}
	verifier := provider.Verifier(cfg)

	return &KeycloakProvider{
		provider: provider,
		verifier: verifier,
		config:   config,
	}, nil
}

// VerifyToken validates a Keycloak ID token and returns the parsed token.
// When ClientIDs has more than one entry, the OIDC lib's aud check is off
// and we enforce it here by intersecting the token's "aud" claim with the
// allow-list — anything else is a 401 in the middleware layer.
func (kp *KeycloakProvider) VerifyToken(ctx context.Context, rawToken string) (*oidc.IDToken, error) {
	tok, err := kp.verifier.Verify(ctx, rawToken)
	if err != nil {
		return nil, err
	}
	if len(kp.config.ClientIDs) > 1 {
		var audClaim struct {
			Aud audience `json:"aud"`
			Azp string   `json:"azp"`
		}
		if err := tok.Claims(&audClaim); err != nil {
			return nil, fmt.Errorf("failed to read aud/azp claims: %w", err)
		}
		// Token must claim at least one of the allowed audiences, or its
		// authorized-party (azp — Keycloak sets it to the issuing client)
		// must be in the list. azp covers the bga-style flow where the
		// SPA's own client ID is the only audience.
		matched := false
		for _, allowed := range kp.config.ClientIDs {
			if audClaim.Azp == allowed {
				matched = true
				break
			}
			for _, a := range audClaim.Aud {
				if a == allowed {
					matched = true
					break
				}
			}
			if matched {
				break
			}
		}
		if !matched {
			return nil, fmt.Errorf("token aud/azp not in allow-list: aud=%v azp=%s allowed=%v",
				audClaim.Aud, audClaim.Azp, kp.config.ClientIDs)
		}
	}
	return tok, nil
}

// audience accepts both `"aud": "x"` (string) and `"aud": ["x","y"]` (array)
// shapes that OIDC tokens can use depending on the issuer.
type audience []string

func (a *audience) UnmarshalJSON(data []byte) error {
	// Try the array shape first.
	var arr []string
	if err := json.Unmarshal(data, &arr); err == nil {
		*a = arr
		return nil
	}
	// Fall back to single string.
	var single string
	if err := json.Unmarshal(data, &single); err != nil {
		return err
	}
	*a = []string{single}
	return nil
}

// IsEnabled returns whether Keycloak authentication is enabled
func (kp *KeycloakProvider) IsEnabled() bool {
	if kp == nil || kp.config == nil {
		return false
	}
	return kp.config.Enabled
}

// GetConfig returns the Keycloak configuration
func (kp *KeycloakProvider) GetConfig() *KeycloakConfig {
	return kp.config
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
