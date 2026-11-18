package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// Report Studio (โปรเจกต์แยก คนละฐานข้อมูล) เป็นเจ้าของข้อมูลรายงานทั้งหมด
// IAMX เก็บแค่ mapping — รายชื่อรายงานอ่านผ่าน REST API ของ Report Studio
//
// ตั้งค่า REPORT_STUDIO_API_BASE (UAT: https://iam.example.com/reportstudio/api)
// ถ้าไม่ได้ตั้ง จะคืน mock ใน report_studio_mock.go
//
// GET {base}/reports/codes คืน array แบน [{"code","name"}] — ไม่มี id/หมวด/สถานะ
// (endpoint อื่นของ Report Studio ต้องใช้ token; /reports/codes เปิดอยู่)

// Report ตรงกับ payload ของ GET /reports/codes
type Report struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

var reportStudioClient = &http.Client{Timeout: 15 * time.Second}

// ReportStudioBase คืน base URL ของ Report Studio API (ว่าง = ยังไม่ตั้งค่า → ใช้ mock)
func ReportStudioBase() string {
	return strings.TrimRight(os.Getenv("REPORT_STUDIO_API_BASE"), "/")
}

// ReportSource บอกว่าข้อมูลรายงานมาจากไหน — ใช้แสดงบน UI
func ReportSource() string {
	if ReportStudioBase() == "" {
		return "mock"
	}
	return "report-studio"
}

// FetchReports ดึงรายชื่อรายงานทั้งหมด แล้วกรองด้วย search ฝั่งเรา
// (/reports/codes ไม่รับพารามิเตอร์ค้นหา)
func FetchReports(search string) ([]Report, error) {
	reports := mockReports

	if base := ReportStudioBase(); base != "" {
		res, err := reportStudioClient.Get(base + "/reports/codes")
		if err != nil {
			return nil, fmt.Errorf("report studio unreachable: %w", err)
		}
		defer res.Body.Close()

		if res.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("report studio returned %d", res.StatusCode)
		}
		if err := json.NewDecoder(res.Body).Decode(&reports); err != nil {
			return nil, fmt.Errorf("report studio returned invalid JSON: %w", err)
		}
	}

	return filterReports(normalizeReports(reports), search), nil
}

// normalizeReports ตัดช่องว่างหัวท้าย และตัดรหัสซ้ำทิ้ง
// ข้อมูล UAT มีแถวที่ code เป็น " APS-00-RPT02" (นำหน้าด้วยช่องว่าง)
// ซึ่งซ้ำกับ "APS-00-RPT02" — ถ้าไม่ trim จะกลายเป็นสองรายงานคนละอัน
func normalizeReports(reports []Report) []Report {
	seen := make(map[string]struct{}, len(reports))
	out := make([]Report, 0, len(reports))

	for _, r := range reports {
		code := strings.TrimSpace(r.Code)
		if code == "" {
			continue
		}
		if _, dup := seen[code]; dup {
			continue
		}
		seen[code] = struct{}{}
		out = append(out, Report{Code: code, Name: strings.TrimSpace(r.Name)})
	}

	return out
}

func filterReports(reports []Report, search string) []Report {
	q := strings.ToLower(strings.TrimSpace(search))
	if q == "" {
		return reports
	}

	out := make([]Report, 0, len(reports))
	for _, r := range reports {
		if strings.Contains(strings.ToLower(r.Code), q) ||
			strings.Contains(strings.ToLower(r.Name), q) {
			out = append(out, r)
		}
	}
	return out
}
