package handlers

import (
	"api/core/config"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// H-1 (security audit 16 ต.ค. 2569): POST /iamx/api/register used to be public and
// trusted pid / keycloakSub / email / password straight from the JSON body, so any
// caller that could reach the service could create USER_INFO rows under someone
// else's national ID or reset the email+password of an existing account.
//
// The handler now binds identity to proof. A call is accepted in one of three modes:
//
//   token   — Authorization: Bearer <Keycloak access token>, verified by the OIDC
//             verifier (signature/JWKS, issuer, exp) plus the aud/azp allow-list.
//             pid / keycloakSub / preferred_username come from the token claims.
//   service — X-IAMX-Register-Ts + X-IAMX-Register-Sig: HMAC-SHA256 over the raw body,
//             keyed by REGISTER_SERVICE_SECRET shared only with the bb-portal BFF
//             (which has already verified the OTP). Body fields are vouched for by
//             the BFF, except keycloakSub, which is only ever taken from a token.
//   legacy  — transitional, only while REGISTER_LEGACY_INTERNAL=true, and only for
//             calls that did not come through the ingress (no proxy headers) or that
//             arrived on the internal listener (NetworkPolicy: bb-portal pods only).
//             Exists so the current bb-portal build keeps working until it sends a
//             token/signature; guarded so it cannot overwrite an existing account.
//
// Both token and service may be present (ThaiD signup from the BFF): pid/sub from
// the token, email/password from the signed body.

const (
	registerModeToken   = "token"
	registerModeService = "service"
	registerModeLegacy  = "legacy"

	registerSigMaxSkew = 5 * time.Minute

	// LocalsInternalListener is set by the internal-only listener (main.go).
	LocalsInternalListener = "iamx_internal_listener"
)

type registerCaller struct {
	Mode          string
	HasToken      bool
	ServiceSigned bool
	Sub           string
	PID           string
	Email         string
	Username      string
}

var errRegisterUnauthenticated = errors.New("registration call carries no valid proof of identity")

type registerTokenClaims struct {
	Sub               string `json:"sub"`
	PID               string `json:"pid"`
	PersonalID        string `json:"personal_id"`
	NationalID        string `json:"national_id"`
	Email             string `json:"email"`
	PreferredUsername string `json:"preferred_username"`
}

func resolveRegisterCaller(c *fiber.Ctx) (*registerCaller, error) {
	caller := &registerCaller{}

	if raw := c.Get("Authorization"); strings.HasPrefix(raw, "Bearer ") {
		token := strings.TrimSpace(strings.TrimPrefix(raw, "Bearer "))
		claims, err := verifyRegisterToken(token)
		if err != nil {
			// A token that is present but invalid is a hard failure — never fall back.
			return nil, err
		}
		caller.HasToken = true
		caller.Sub = claims.Sub
		caller.PID = firstNonEmpty(claims.PID, claims.PersonalID, claims.NationalID)
		caller.Email = strings.TrimSpace(claims.Email)
		caller.Username = claims.PreferredUsername
	}

	if c.Get("X-IAMX-Register-Sig") != "" || c.Get("X-IAMX-Register-Ts") != "" {
		if !validRegisterSignature(c.Get("X-IAMX-Register-Ts"), c.Get("X-IAMX-Register-Sig"), c.Body()) {
			return nil, errRegisterUnauthenticated
		}
		caller.ServiceSigned = true
	}

	switch {
	case caller.HasToken:
		caller.Mode = registerModeToken
	case caller.ServiceSigned:
		caller.Mode = registerModeService
	case legacyRegisterAllowed(c):
		caller.Mode = registerModeLegacy
	default:
		return nil, errRegisterUnauthenticated
	}
	return caller, nil
}

func verifyRegisterToken(token string) (*registerTokenClaims, error) {
	if token == "" {
		return nil, errRegisterUnauthenticated
	}
	provider, err := config.GetKeycloakProvider()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	idTok, err := provider.VerifyToken(ctx, token) // signature, issuer, exp, aud/azp
	if err != nil {
		return nil, err
	}
	var claims registerTokenClaims
	if err := idTok.Claims(&claims); err != nil {
		return nil, err
	}
	if claims.Sub == "" {
		return nil, errRegisterUnauthenticated
	}
	return &claims, nil
}

// RegisterSignature is the value the BFF sends in X-IAMX-Register-Sig.
func RegisterSignature(secret, ts string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("iamx-register:" + ts + ":"))
	mac.Write(body)
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func validRegisterSignature(ts, sig string, body []byte) bool {
	secret := os.Getenv("REGISTER_SERVICE_SECRET")
	if len(secret) < 32 || ts == "" || sig == "" {
		return false
	}
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return false
	}
	skew := time.Since(time.Unix(sec, 0))
	if skew < -registerSigMaxSkew || skew > registerSigMaxSkew {
		return false
	}
	expect := RegisterSignature(secret, ts, body)
	return hmac.Equal([]byte(expect), []byte(sig))
}

func legacyRegisterAllowed(c *fiber.Ctx) bool {
	if os.Getenv("REGISTER_LEGACY_INTERNAL") != "true" {
		return false
	}
	if internal, _ := c.Locals(LocalsInternalListener).(bool); internal {
		return true
	}
	// Anything relayed by the ingress / gateway carries these; a direct in-cluster
	// call from the BFF does not. A client cannot strip headers the proxy adds.
	for _, h := range []string{"X-Forwarded-For", "X-Real-IP", "X-Forwarded-Host", "X-Forwarded-Proto", "Forwarded", "CF-Connecting-IP"} {
		if c.Get(h) != "" {
			return false
		}
	}
	return true
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}
