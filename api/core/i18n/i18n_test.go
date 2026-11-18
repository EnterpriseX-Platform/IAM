package i18n

import "testing"

func TestT(t *testing.T) {
	cases := map[string]string{
		"ไม่พบผู้ใช้":                      "User not found",
		"ปี 2569 มีข้อมูลอยู่แล้ว":         "Year 2569 already has data",
		"กำหนดบทบาท \"X\" ไม่สำเร็จ: boom": "Couldn't assign role \"X\": boom",
		"นาย":             "นาย",
		"already english": "already english",
	}
	for in, want := range cases {
		if got := T(in); got != want {
			t.Errorf("T(%q)=%q want %q", in, got, want)
		}
	}
	if b := Body([]byte(`{"success":false,"message":"ไม่พบผู้ใช้","data":{"title":"นาย"}}`)); b == nil || string(b) != `{"data":{"title":"นาย"},"message":"User not found","success":false}` {
		t.Errorf("Body = %s", b)
	}
}
