package token

import (
	"errors"
	"fmt"
	"time"

	"github.com/dgrijalva/jwt-go"
)

const (
	// DefaultSignedKey is the default HMAC secret key for signing tokens
	DefaultSignedKey = "AllYourBase"

	// IssuerOTP is used for OTP verification tokens
	IssuerOTP = "OTP"

	// IssuerCenterApp is used for regular authentication tokens
	IssuerCenterApp = "CenterApp"
)

// UserClaims defines the JWT claims structure used by PlayME
type UserClaims struct {
	UserID       string `json:"userID,omitempty"`
	GroupIam2ID  string `json:"groupIam2ID"`
	Firstname    string `json:"firstname,omitempty"`
	Lastname     string `json:"lastname,omitempty"`
	Username     string `json:"username,omitempty"`
	Email        string `json:"email,omitempty"`
	AccessToken  string `json:"accessToken,omitempty"`
	RefreshToken string `json:"refreshToken,omitempty"`
	IsIAM2       bool   `json:"isIAM2,omitempty"`
	jwt.StandardClaims
}

// GetJWTToken generates a JWT token with the provided claims
func GetJWTToken(claims *UserClaims, signedKey string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS512, claims)
	ss, err := token.SignedString([]byte(signedKey))
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}
	return ss, nil
}

// VerifiedJWTToken verifies and parses a JWT token
func VerifiedJWTToken(tokenString string, signedKey string) (*jwt.Token, error) {
	token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(signedKey), nil
	})
	if err != nil {
		return nil, err
	}
	if token != nil && !token.Valid {
		return nil, errors.New("JWT token invalid")
	}
	return token, nil
}

// GenerateToken creates a JWT token for IAMX user
// userid = ref_user_id
func GenerateToken(refUserID, username, email, firstname, lastname string) (string, error) {
	expiresAt := time.Now().Add(time.Hour * 24 * 30) // 30 days

	claims := UserClaims{
		UserID:    refUserID, // userid = ref_user_id as requested
		Username:  username,
		Email:     email,
		Firstname: firstname,
		Lastname:  lastname,
		IsIAM2:    false,
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: expiresAt.Unix(),
			IssuedAt:  time.Now().Unix(),
			Issuer:    IssuerCenterApp,
		},
	}

	return GetJWTToken(&claims, DefaultSignedKey)
}
