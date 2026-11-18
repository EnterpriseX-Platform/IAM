package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// flow "ERP browser" มี "Browser - Conditional 2FA" (ถาม OTP เมื่อผู้ใช้ตั้ง OTP ไว้แล้ว) อยู่เดิม ⇒ ไม่แก้ flow
// เปิด = ใส่ required action CONFIGURE_TOTP (ผู้ใช้ตั้งแอปตอน login ครั้งถัดไป) · ปิด = ลบ OTP credential + ถอด required action

const configureTOTP = "CONFIGURE_TOTP"

type TwoFactorStatus struct {
	Enabled    bool `json:"enabled"`    // เปิดอยู่ (ตั้งแล้ว หรือรอตั้งตอนเข้าระบบครั้งถัดไป)
	Configured bool `json:"configured"` // ผู้ใช้ตั้งแอป OTP เรียบร้อยแล้ว
	Pending    bool `json:"pending"`    // สั่งเปิดแล้ว ยังไม่ได้ตั้งแอป
}

func (c *KeycloakAdminClient) jsonCall(method, path string, body interface{}, out interface{}) error {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewBuffer(b)
	}
	req, err := http.NewRequest(method, fmt.Sprintf("%s/admin/realms/%s%s", c.BaseURL, c.Realm, path), rd)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.doRequest(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Keycloak %s %s: %s - %s", method, path, resp.Status, string(b))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

type kcCredential struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

func (c *KeycloakAdminClient) otpCredentials(userID string) ([]kcCredential, error) {
	var creds []kcCredential
	if err := c.jsonCall("GET", "/users/"+userID+"/credentials", nil, &creds); err != nil {
		return nil, err
	}
	var otp []kcCredential
	for _, cr := range creds {
		if cr.Type == "otp" {
			otp = append(otp, cr)
		}
	}
	return otp, nil
}

func (c *KeycloakAdminClient) requiredActions(userID string) ([]string, error) {
	var u struct {
		RequiredActions []string `json:"requiredActions"`
	}
	if err := c.jsonCall("GET", "/users/"+userID, nil, &u); err != nil {
		return nil, err
	}
	return u.RequiredActions, nil
}

func (c *KeycloakAdminClient) GetTwoFactorStatus(userID string) (TwoFactorStatus, error) {
	otp, err := c.otpCredentials(userID)
	if err != nil {
		return TwoFactorStatus{}, err
	}
	ra, err := c.requiredActions(userID)
	if err != nil {
		return TwoFactorStatus{}, err
	}
	pending := false
	for _, a := range ra {
		if a == configureTOTP {
			pending = true
		}
	}
	return TwoFactorStatus{Enabled: len(otp) > 0 || pending, Configured: len(otp) > 0, Pending: pending && len(otp) == 0}, nil
}

// SetTwoFactor เปิด/ปิด 2FA ของผู้ใช้ 1 คน (แก้เฉพาะ requiredActions/OTP credential — ไม่แตะ attribute อื่น)
func (c *KeycloakAdminClient) SetTwoFactor(userID string, enabled bool) error {
	ra, err := c.requiredActions(userID)
	if err != nil {
		return err
	}
	next := []string{}
	for _, a := range ra {
		if a != configureTOTP {
			next = append(next, a)
		}
	}
	if enabled {
		otp, err := c.otpCredentials(userID)
		if err != nil {
			return err
		}
		if len(otp) == 0 { // ยังไม่ได้ตั้งแอป → ให้ตั้งตอนเข้าระบบครั้งถัดไป
			next = append(next, configureTOTP)
		}
	} else {
		otp, err := c.otpCredentials(userID)
		if err != nil {
			return err
		}
		for _, cr := range otp {
			if err := c.jsonCall("DELETE", "/users/"+userID+"/credentials/"+cr.ID, nil, nil); err != nil {
				return err
			}
		}
	}
	return c.jsonCall("PUT", "/users/"+userID, map[string]interface{}{"requiredActions": next}, nil)
}
