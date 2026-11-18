// Package i18n แปลข้อความ message/error ของ API เป็นภาษาอังกฤษ (14/11/69 ระบบ IAMX เป็นภาษาอังกฤษ)
// แปลเฉพาะข้อความตอบกลับ ไม่แตะข้อมูล (ชื่อรายงาน คำนำหน้าชื่อ ฯลฯ) · ปิดได้ด้วย IAMX_LANG=th
package i18n

import (
	_ "embed"
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"unicode"
)

//go:embed messages_en.json
var raw []byte

type pattern struct {
	re  *regexp.Regexp
	out string
}

var (
	exact    = map[string]string{}
	patterns []pattern
	verbRe   = regexp.MustCompile(`%[sdvq]`)
)

func init() {
	m := map[string]string{}
	_ = json.Unmarshal(raw, &m)
	for th, en := range m {
		if !verbRe.MatchString(th) {
			exact[th] = en
			continue
		}
		// "ปี %s มีข้อมูลอยู่แล้ว" → ^ปี (.+?) มีข้อมูลอยู่แล้ว$ · ใส่ค่าที่จับได้กลับตามลำดับ
		parts := verbRe.Split(th, -1)
		for i := range parts {
			parts[i] = regexp.QuoteMeta(parts[i])
		}
		re := regexp.MustCompile("^" + strings.Join(parts, "(.+?)") + "$")
		n := 0
		out := verbRe.ReplaceAllStringFunc(en, func(string) string { n++; return "\x00" + string(rune('0'+n)) })
		patterns = append(patterns, pattern{re, out})
	}
}

func Enabled() bool { return os.Getenv("IAMX_LANG") != "th" }

func hasThai(s string) bool {
	for _, r := range s {
		if unicode.In(r, unicode.Thai) {
			return true
		}
	}
	return false
}

// T แปลข้อความหนึ่งข้อความ · ไม่รู้จัก = คืนค่าเดิม
func T(s string) string {
	if !Enabled() || !hasThai(s) {
		return s
	}
	if v, ok := exact[s]; ok {
		return v
	}
	for _, p := range patterns {
		if m := p.re.FindStringSubmatch(s); m != nil {
			out := p.out
			for i := 1; i < len(m); i++ {
				out = strings.Replace(out, "\x00"+string(rune('0'+i)), m[i], 1)
			}
			return out
		}
	}
	return s
}

// Body แปล message/error/msg ระดับบนของ JSON · คืน nil ถ้าไม่ต้องเปลี่ยน
func Body(b []byte) []byte {
	if !Enabled() || !hasThai(string(b)) {
		return nil
	}
	var m map[string]interface{}
	if json.Unmarshal(b, &m) != nil {
		return nil
	}
	changed := false
	for _, k := range []string{"message", "error", "msg"} {
		if s, ok := m[k].(string); ok {
			if t := T(s); t != s {
				m[k] = t
				changed = true
			}
		}
	}
	if !changed {
		return nil
	}
	out, err := json.Marshal(m)
	if err != nil {
		return nil
	}
	return out
}
