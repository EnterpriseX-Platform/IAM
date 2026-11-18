package handlers

import (
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
)

const testSecret = "0123456789abcdef0123456789abcdef-test"

func probe(t *testing.T, setup func(r *httpRequest)) (int, string) {
	t.Helper()
	app := fiber.New()
	app.Post("/r", func(c *fiber.Ctx) error {
		caller, err := resolveRegisterCaller(c)
		if err != nil {
			return c.Status(401).SendString("denied")
		}
		return c.SendString(caller.Mode)
	})
	r := &httpRequest{body: `{"pid":"1234567890123","email":"a@b.c"}`, headers: map[string]string{}}
	setup(r)
	req := httptest.NewRequest("POST", "/r", strings.NewReader(r.body))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range r.headers {
		req.Header.Set(k, v)
	}
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	buf := new(strings.Builder)
	b := make([]byte, 256)
	n, _ := resp.Body.Read(b)
	buf.Write(b[:n])
	return resp.StatusCode, buf.String()
}

type httpRequest struct {
	body    string
	headers map[string]string
}

func sign(r *httpRequest, ts int64) {
	s := strconv.FormatInt(ts, 10)
	r.headers["X-IAMX-Register-Ts"] = s
	r.headers["X-IAMX-Register-Sig"] = RegisterSignature(testSecret, s, []byte(r.body))
}

func TestRegisterCaller(t *testing.T) {
	t.Setenv("REGISTER_SERVICE_SECRET", testSecret)

	t.Run("no proof, legacy off -> denied", func(t *testing.T) {
		t.Setenv("REGISTER_LEGACY_INTERNAL", "false")
		if code, _ := probe(t, func(r *httpRequest) {}); code != 401 {
			t.Fatalf("want 401 got %d", code)
		}
	})
	t.Run("legacy on, direct call -> legacy", func(t *testing.T) {
		t.Setenv("REGISTER_LEGACY_INTERNAL", "true")
		if code, body := probe(t, func(r *httpRequest) {}); code != 200 || body != "legacy" {
			t.Fatalf("got %d %q", code, body)
		}
	})
	t.Run("legacy on, via ingress (X-Forwarded-For) -> denied", func(t *testing.T) {
		t.Setenv("REGISTER_LEGACY_INTERNAL", "true")
		code, _ := probe(t, func(r *httpRequest) { r.headers["X-Forwarded-For"] = "203.0.113.9" })
		if code != 401 {
			t.Fatalf("want 401 got %d", code)
		}
	})
	t.Run("valid signature -> service", func(t *testing.T) {
		t.Setenv("REGISTER_LEGACY_INTERNAL", "false")
		code, body := probe(t, func(r *httpRequest) { sign(r, time.Now().Unix()) })
		if code != 200 || body != "service" {
			t.Fatalf("got %d %q", code, body)
		}
	})
	t.Run("signature over different body (forged field) -> denied", func(t *testing.T) {
		t.Setenv("REGISTER_LEGACY_INTERNAL", "true")
		code, _ := probe(t, func(r *httpRequest) {
			sign(r, time.Now().Unix())
			r.body = `{"pid":"9999999999999","email":"a@b.c"}`
		})
		if code != 401 {
			t.Fatalf("want 401 got %d", code)
		}
	})
	t.Run("stale signature -> denied", func(t *testing.T) {
		code, _ := probe(t, func(r *httpRequest) { sign(r, time.Now().Add(-10*time.Minute).Unix()) })
		if code != 401 {
			t.Fatalf("want 401 got %d", code)
		}
	})
	t.Run("garbage bearer never falls back to legacy", func(t *testing.T) {
		t.Setenv("REGISTER_LEGACY_INTERNAL", "true")
		code, _ := probe(t, func(r *httpRequest) { r.headers["Authorization"] = "Bearer aaa.bbb.ccc" })
		if code != 401 {
			t.Fatalf("want 401 got %d", code)
		}
	})
	t.Run("short secret disables service mode", func(t *testing.T) {
		t.Setenv("REGISTER_SERVICE_SECRET", "short")
		t.Setenv("REGISTER_LEGACY_INTERNAL", "false")
		code, _ := probe(t, func(r *httpRequest) {
			s := strconv.FormatInt(time.Now().Unix(), 10)
			r.headers["X-IAMX-Register-Ts"] = s
			r.headers["X-IAMX-Register-Sig"] = RegisterSignature("short", s, []byte(r.body))
		})
		if code != 401 {
			t.Fatalf("want 401 got %d", code)
		}
	})
}
