package services

// Mock ของ Report Studio — ใช้จนกว่า REPORT_STUDIO_API_BASE จะพร้อม
// ตัวอย่างจริงจาก GET https://iam.example.com/reportstudio/api/reports/codes
// (ของจริงมี 403 รายการ ตัดมาระบบละ 1 รายการพอให้เห็นรูปแบบ)
// เมื่อชี้ไป API จริงแล้ว ลบไฟล์นี้ทิ้งได้ทั้งไฟล์

var mockReports = []Report{
	{Code: "SAMPLE-RPT01", Name: "Sample report 1"},
	{Code: "SAMPLE-RPT02", Name: "Sample report 2"},
	{Code: "SAMPLE-RPT03", Name: "Sample report 3"},
}
