package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// ErrKeycloakUserExists — Keycloak ตอบ 409 ตอนสร้างผู้ใช้ (มีบัญชีอีเมล/ชื่อผู้ใช้นี้อยู่แล้ว)
// ผู้เรียกแยกกรณีนี้ได้ด้วย errors.Is แทนการเทียบข้อความ
var ErrKeycloakUserExists = errors.New("user already exists in Keycloak")

// KeycloakAdminClient provides Keycloak Admin API operations
type KeycloakAdminClient struct {
	BaseURL      string
	Realm        string
	ClientID     string
	ClientSecret string
	AdminToken   string
}

// NewKeycloakAdminClient creates a new Keycloak admin client
func NewKeycloakAdminClient() *KeycloakAdminClient {
	return &KeycloakAdminClient{
		// 29/10/69: /idp/admin และ /idp/realms/master ถูกปิดจาก public (VS คืน 404)
		// งานผู้ดูแล (สร้าง/ปิด/ลบบัญชี, ส่งลิงก์ตั้งรหัส) จึงต้องเรียกผ่าน service ภายในคลัสเตอร์
		// KEYCLOAK_ADMIN_URL ไม่ตั้ง = ใช้ KEYCLOAK_URL เหมือนเดิม
		BaseURL:      firstNonEmpty(os.Getenv("KEYCLOAK_ADMIN_URL"), os.Getenv("KEYCLOAK_URL")),
		Realm:        os.Getenv("KEYCLOAK_REALM"),
		ClientID:     os.Getenv("KEYCLOAK_CLIENT_ID"),
		ClientSecret: os.Getenv("KEYCLOAK_CLIENT_SECRET"),
	}
}

// keycloakTokenResponse represents the token response from Keycloak
type keycloakTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

// GetAdminToken obtains an admin access token from Keycloak
func (c *KeycloakAdminClient) GetAdminToken() error {
	adminUser := os.Getenv("KEYCLOAK_ADMIN_USERNAME")
	adminPass := os.Getenv("KEYCLOAK_ADMIN_PASSWORD")

	var data url.Values
	var tokenURL string

	if adminUser != "" && adminPass != "" {
		// Use admin-cli with admin credentials
		tokenURL = fmt.Sprintf("%s/realms/master/protocol/openid-connect/token", c.BaseURL)
		data = url.Values{
			"client_id":  {"admin-cli"},
			"username":   {adminUser},
			"password":   {adminPass},
			"grant_type": {"password"},
		}
	} else if c.ClientSecret != "" {
		// Use service account (client credentials)
		tokenURL = fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token", c.BaseURL, c.Realm)
		data = url.Values{
			"client_id":     {c.ClientID},
			"client_secret": {c.ClientSecret},
			"grant_type":    {"client_credentials"},
		}
	} else {
		return fmt.Errorf("no Keycloak admin credentials configured")
	}

	resp, err := http.PostForm(tokenURL, data)
	if err != nil {
		return fmt.Errorf("failed to request admin token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to get admin token: %s - %s", resp.Status, string(body))
	}

	var tokenResp keycloakTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return fmt.Errorf("failed to decode token response: %w", err)
	}

	c.AdminToken = tokenResp.AccessToken
	return nil
}

// keycloakUser represents a user returned by Keycloak's user search API
type keycloakUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// doRequest performs an authenticated HTTP request with automatic token refresh
func (c *KeycloakAdminClient) doRequest(req *http.Request) (*http.Response, error) {
	if c.AdminToken == "" {
		if err := c.GetAdminToken(); err != nil {
			return nil, err
		}
	}
	req.Header.Set("Authorization", "Bearer "+c.AdminToken)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		if err := c.GetAdminToken(); err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+c.AdminToken)
		resp, err = client.Do(req)
		if err != nil {
			return nil, err
		}
	}

	return resp, nil
}

// FindUserByEmail searches Keycloak for a user by email and returns their Keycloak ID
func (c *KeycloakAdminClient) FindUserByEmail(email string) (string, error) {
	reqURL := fmt.Sprintf("%s/admin/realms/%s/users?email=%s&exact=true&max=1", c.BaseURL, c.Realm, url.QueryEscape(email))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.doRequest(req)
	if err != nil {
		return "", fmt.Errorf("failed to search Keycloak user: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Keycloak search failed: %s - %s", resp.Status, string(body))
	}

	var users []keycloakUser
	if err := json.NewDecoder(resp.Body).Decode(&users); err != nil {
		return "", fmt.Errorf("failed to decode Keycloak users: %w", err)
	}

	if len(users) == 0 {
		return "", fmt.Errorf("user not found in Keycloak")
	}

	return users[0].ID, nil
}

// FindUserByUsername searches Keycloak for a user by exact username and returns their Keycloak UUID
func (c *KeycloakAdminClient) FindUserByUsername(username string) (string, error) {
	reqURL := fmt.Sprintf("%s/admin/realms/%s/users?username=%s&exact=true&max=1", c.BaseURL, c.Realm, url.QueryEscape(username))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.doRequest(req)
	if err != nil {
		return "", fmt.Errorf("failed to search Keycloak user by username: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Keycloak username search failed: %s - %s", resp.Status, string(body))
	}

	var users []keycloakUser
	if err := json.NewDecoder(resp.Body).Decode(&users); err != nil {
		return "", fmt.Errorf("failed to decode Keycloak users: %w", err)
	}

	if len(users) == 0 {
		return "", fmt.Errorf("user not found in Keycloak by username %q", username)
	}

	return users[0].ID, nil
}

// CreateUser creates a new user in Keycloak
func (c *KeycloakAdminClient) CreateUser(email, firstName, lastName, username, password string, temporary bool) (string, error) {
	if username == "" {
		username = email
	}

	userPayload := map[string]interface{}{
		"username":  username,
		"email":     email,
		"firstName": firstName,
		"lastName":  lastName,
		"enabled":   true,
	}
	if password != "" {
		userPayload["credentials"] = []map[string]interface{}{
			{
				"type":      "password",
				"value":     password,
				"temporary": temporary,
			},
		}
	}

	jsonBody, err := json.Marshal(userPayload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal user payload: %w", err)
	}

	reqURL := fmt.Sprintf("%s/admin/realms/%s/users", c.BaseURL, c.Realm)
	req, err := http.NewRequest("POST", reqURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.doRequest(req)
	if err != nil {
		return "", fmt.Errorf("failed to create Keycloak user: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusConflict {
		return "", ErrKeycloakUserExists
	}

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode == http.StatusBadRequest && strings.Contains(string(body), "invalidPassword") {
			return "", fmt.Errorf("%w: %s", ErrKeycloakPasswordPolicy, string(body))
		}
		return "", fmt.Errorf("failed to create Keycloak user: %s - %s", resp.Status, string(body))
	}

	// Extract user ID from Location header
	location := resp.Header.Get("Location")
	if location != "" {
		parts := strings.Split(location, "/")
		if len(parts) > 0 {
			return parts[len(parts)-1], nil
		}
	}

	return "", nil
}

func firstNonEmpty(v ...string) string {
	for _, x := range v {
		if strings.TrimSpace(x) != "" {
			return x
		}
	}
	return ""
}

// ErrKeycloakPasswordPolicy — Keycloak ปฏิเสธรหัสผ่านเพราะไม่ผ่าน password policy ของ realm
var ErrKeycloakPasswordPolicy = errors.New("password does not satisfy realm policy")

// ExecuteActionsEmail ให้ Keycloak ส่งอีเมลลิงก์ทำ required actions (เช่น UPDATE_PASSWORD) ด้วย SMTP/ธีมของ realm
// (PUT /admin/realms/{realm}/users/{id}/execute-actions-email) — กลไกเดียวกับปุ่ม "Send email" ในหน้า admin ของ Keycloak
// clientID/redirectURI ว่างได้ · lifespan เป็นวินาที (0 = ค่าของ realm)
func (c *KeycloakAdminClient) ExecuteActionsEmail(userID string, actions []string, clientID, redirectURI string, lifespan int) error {
	q := url.Values{}
	if clientID != "" {
		q.Set("client_id", clientID)
		if redirectURI != "" {
			q.Set("redirect_uri", redirectURI)
		}
	}
	if lifespan > 0 {
		q.Set("lifespan", fmt.Sprintf("%d", lifespan))
	}
	reqURL := fmt.Sprintf("%s/admin/realms/%s/users/%s/execute-actions-email", c.BaseURL, c.Realm, userID)
	if len(q) > 0 {
		reqURL += "?" + q.Encode()
	}
	jsonBody, _ := json.Marshal(actions)
	req, err := http.NewRequest("PUT", reqURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.doRequest(req)
	if err != nil {
		return fmt.Errorf("execute-actions-email request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("execute-actions-email failed: %s - %s", resp.Status, string(body))
	}
	return nil
}

// SetUserPassword ตั้งรหัสผ่านให้บัญชี Keycloak ที่มีอยู่แล้ว (PUT .../reset-password)
func (c *KeycloakAdminClient) SetUserPassword(userID, password string, temporary bool) error {
	jsonBody, err := json.Marshal(map[string]interface{}{
		"type":      "password",
		"value":     password,
		"temporary": temporary,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal password payload: %w", err)
	}

	reqURL := fmt.Sprintf("%s/admin/realms/%s/users/%s/reset-password", c.BaseURL, c.Realm, userID)
	req, err := http.NewRequest("PUT", reqURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.doRequest(req)
	if err != nil {
		return fmt.Errorf("failed to set Keycloak user password: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Keycloak reset-password failed: %s - %s", resp.Status, string(body))
	}
	return nil
}

// SetUserEnabled enables or disables a Keycloak user
func (c *KeycloakAdminClient) SetUserEnabled(userID string, enabled bool) error {
	payload := map[string]interface{}{"enabled": enabled}
	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal enable payload: %w", err)
	}

	reqURL := fmt.Sprintf("%s/admin/realms/%s/users/%s", c.BaseURL, c.Realm, userID)
	req, err := http.NewRequest("PUT", reqURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.doRequest(req)
	if err != nil {
		return fmt.Errorf("failed to set Keycloak user enabled: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Keycloak enable/disable failed: %s - %s", resp.Status, string(body))
	}

	return nil
}

// GetFederatedIdentity returns the federated identity for a given IdP alias on a Keycloak user
func (c *KeycloakAdminClient) GetFederatedIdentity(userID, idpAlias string) (map[string]string, error) {
	reqURL := fmt.Sprintf("%s/admin/realms/%s/users/%s/federated-identity", c.BaseURL, c.Realm, userID)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get federated identities: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Keycloak federated-identity list failed: %s - %s", resp.Status, string(body))
	}

	var identities []map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&identities); err != nil {
		return nil, fmt.Errorf("failed to decode federated identities: %w", err)
	}

	for _, identity := range identities {
		if identity["identityProvider"] == idpAlias {
			return identity, nil
		}
	}

	return nil, fmt.Errorf("federated identity for provider %q not found on user %s", idpAlias, userID)
}

// AddFederatedIdentity links an external IdP identity to a Keycloak user
func (c *KeycloakAdminClient) AddFederatedIdentity(userID, idpAlias string, identity map[string]string) error {
	payload := map[string]string{
		"identityProvider": idpAlias,
		"userId":           identity["userId"],
		"userName":         identity["userName"],
	}
	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal federated identity payload: %w", err)
	}

	reqURL := fmt.Sprintf("%s/admin/realms/%s/users/%s/federated-identity/%s", c.BaseURL, c.Realm, userID, idpAlias)
	req, err := http.NewRequest("POST", reqURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.doRequest(req)
	if err != nil {
		return fmt.Errorf("failed to add federated identity: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Keycloak add federated-identity failed: %s - %s", resp.Status, string(body))
	}

	return nil
}

// UpdateUserEmailAndPassword sets email and a permanent password on an existing Keycloak user
func (c *KeycloakAdminClient) UpdateUserEmailAndPassword(userID, email, password string) error {
	// Step 1 — update email only (do not change username — ThaiD username set by IdP)
	emailPayload := map[string]interface{}{
		"email":         email,
		"emailVerified": true,
	}
	jsonBody, err := json.Marshal(emailPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal email payload: %w", err)
	}

	reqURL := fmt.Sprintf("%s/admin/realms/%s/users/%s", c.BaseURL, c.Realm, userID)
	req, err := http.NewRequest("PUT", reqURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.doRequest(req)
	if err != nil {
		return fmt.Errorf("failed to update Keycloak user email: %w", err)
	}
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return fmt.Errorf("Keycloak update email failed: %s - %s", resp.Status, string(body))
	}
	resp.Body.Close()

	// Step 2 — set permanent password
	pwPayload := map[string]interface{}{
		"type":      "password",
		"value":     password,
		"temporary": false,
	}
	jsonBody, err = json.Marshal(pwPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal password payload: %w", err)
	}

	pwURL := fmt.Sprintf("%s/admin/realms/%s/users/%s/reset-password", c.BaseURL, c.Realm, userID)
	req, err = http.NewRequest("PUT", pwURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err = c.doRequest(req)
	if err != nil {
		return fmt.Errorf("failed to set Keycloak user password: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Keycloak reset-password failed: %s - %s", resp.Status, string(body))
	}

	return nil
}

// FindUserByPID searches Keycloak for a user whose custom attribute "pid" matches the given value.
// Returns the Keycloak user ID if found, empty string + nil if not found.
func (c *KeycloakAdminClient) FindUserByPID(pid string) (string, error) {
	if pid == "" {
		return "", nil
	}
	reqURL := fmt.Sprintf("%s/admin/realms/%s/users?q=pid:%s&max=1", c.BaseURL, c.Realm, url.QueryEscape(pid))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.doRequest(req)
	if err != nil {
		return "", fmt.Errorf("Keycloak PID search failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Keycloak PID search error: %s - %s", resp.Status, string(body))
	}

	var users []keycloakUser
	if err := json.NewDecoder(resp.Body).Decode(&users); err != nil {
		return "", fmt.Errorf("failed to decode Keycloak PID search: %w", err)
	}
	if len(users) == 0 {
		return "", nil
	}
	return users[0].ID, nil
}

// DeleteUser permanently deletes a user from Keycloak
func (c *KeycloakAdminClient) DeleteUser(userID string) error {
	reqURL := fmt.Sprintf("%s/admin/realms/%s/users/%s", c.BaseURL, c.Realm, userID)
	req, err := http.NewRequest("DELETE", reqURL, nil)
	if err != nil {
		return err
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return fmt.Errorf("failed to delete Keycloak user: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Keycloak delete failed: %s - %s", resp.Status, string(body))
	}

	return nil
}

// GetUserRegistrationState reports whether a Keycloak user already has an email
// set and how many external IdP links (e.g. ThaiD) it carries. RegisterHandler
// uses it to refuse writing an email/password onto an account that is already
// set up — an unauthenticated caller must never be able to take over an account.
func (c *KeycloakAdminClient) GetUserRegistrationState(userID string) (email string, federatedLinks int, err error) {
	if userID == "" {
		return "", 0, fmt.Errorf("empty Keycloak user id")
	}
	reqURL := fmt.Sprintf("%s/admin/realms/%s/users/%s", c.BaseURL, c.Realm, url.PathEscape(userID))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return "", 0, err
	}
	resp, err := c.doRequest(req)
	if err != nil {
		return "", 0, fmt.Errorf("Keycloak user lookup failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", 0, fmt.Errorf("Keycloak user lookup error: %s - %s", resp.Status, string(body))
	}
	var u keycloakUser
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return "", 0, fmt.Errorf("failed to decode Keycloak user: %w", err)
	}

	fedURL := fmt.Sprintf("%s/admin/realms/%s/users/%s/federated-identity", c.BaseURL, c.Realm, url.PathEscape(userID))
	fedReq, err := http.NewRequest("GET", fedURL, nil)
	if err != nil {
		return u.Email, 0, err
	}
	fedResp, err := c.doRequest(fedReq)
	if err != nil {
		return u.Email, 0, fmt.Errorf("Keycloak federated-identity lookup failed: %w", err)
	}
	defer fedResp.Body.Close()
	if fedResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(fedResp.Body)
		return u.Email, 0, fmt.Errorf("Keycloak federated-identity error: %s - %s", fedResp.Status, string(body))
	}
	var links []map[string]interface{}
	if err := json.NewDecoder(fedResp.Body).Decode(&links); err != nil {
		return u.Email, 0, fmt.Errorf("failed to decode federated identities: %w", err)
	}
	return u.Email, len(links), nil
}

// 14/11/69 หน้า Activity: อ่านประวัติการเข้าใช้ (user events) ของ realm — ต้องเปิด "Save events" ใน realm ก่อน
// query: first, max, type (ซ้ำได้), user, dateFrom, dateTo (yyyy-MM-dd)
func (c *KeycloakAdminClient) GetEvents(query url.Values) ([]map[string]interface{}, error) {
	reqURL := fmt.Sprintf("%s/admin/realms/%s/events?%s", c.BaseURL, c.Realm, query.Encode())
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Keycloak events: %s - %s", resp.Status, string(body))
	}
	var out []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

// RealmEventsEnabled บอกว่า realm เปิดเก็บ user events อยู่ไหม
func (c *KeycloakAdminClient) RealmEventsEnabled() (bool, error) {
	req, err := http.NewRequest("GET", fmt.Sprintf("%s/admin/realms/%s/events/config", c.BaseURL, c.Realm), nil)
	if err != nil {
		return false, err
	}
	resp, err := c.doRequest(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("Keycloak events config: %s", resp.Status)
	}
	var cfg struct {
		EventsEnabled bool `json:"eventsEnabled"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return false, err
	}
	return cfg.EventsEnabled, nil
}
