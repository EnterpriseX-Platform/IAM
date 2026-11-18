package handlers

// 13/11/69: หน้าแรก IAM-X — สิ่งที่ผู้ดูแลต้องจัดการ + เปลี่ยนแปลงล่าสุด (อ่านอย่างเดียว)

import (
	"api/core"
	"api/core/usertypes"
	"database/sql"
	"log"

	"github.com/gofiber/fiber/v2"
)

type dashboardChange struct {
	Table  string `json:"table"`
	Action string `json:"action"`
	At     string `json:"at"`
	Count  int    `json:"count"`
	Role   string `json:"role,omitempty"`
	User   string `json:"user,omitempty"`
	Resp   string `json:"resp,omitempty"`
}

func GetDashboardSummary(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	count := func(q string) int {
		var n sql.NullInt64
		if err := db.QueryRow(q).Scan(&n); err != nil {
			log.Printf("dashboard count error: %v", err)
			return -1
		}
		return int(n.Int64)
	}

	counts := fiber.Map{
		"users_active":   count(`SELECT COUNT(*) FROM user_info WHERE status = 'active'`),
		"users_inactive": count(`SELECT COUNT(*) FROM user_info WHERE NVL(status,'x') <> 'active'`),
		"roles":          count(`SELECT COUNT(*) FROM role WHERE NVL(is_active,1) = 1`),
		"resps":          count(`SELECT COUNT(*) FROM responsibility`),
		"users_no_role": count(`SELECT COUNT(*) FROM user_info u WHERE u.status = 'active'
			AND NOT EXISTS (SELECT 1 FROM user_role_mapping m JOIN role r ON r.id = m.role_id
			WHERE m.user_id = u.user_id AND m.is_active = 1 AND NVL(r.is_active, 1) = 1)`),
		"users_type_mismatch": count(`SELECT COUNT(DISTINCT u.user_id) FROM user_info u
			JOIN user_role_mapping m ON m.user_id = u.user_id JOIN role r ON r.id = m.role_id
			WHERE u.status = 'active' AND m.is_active = 1 AND NVL(r.is_active, 1) = 1 AND ` + usertypes.SQLNormalize("r.role_type") + ` <> ` + usertypes.SQLNormalize("u.user_type")),
		"users_no_org": count(`SELECT COUNT(*) FROM user_info WHERE status = 'active' AND ` + usertypes.SQLNormalize("user_type") + ` IN (` + usertypes.SQLStaffList() + `)
			AND user_ministry_id IS NULL AND user_department_id IS NULL`),
		"roles_no_menu": count(`SELECT COUNT(*) FROM role r WHERE NVL(r.is_active,1) = 1 AND NOT EXISTS (
			SELECT 1 FROM role_object_mapping m JOIN role_object_permission p ON p.role_object_mapping_id = m.id
			WHERE m.role_id = r.id AND p.permission LIKE '%VIEW%')`),
		// 14/11/69: บทบาทที่หมดอายุแล้วหรือจะหมดใน 30 วัน (ยังเปิดใช้งาน) · การผูกบทบาทรายคนที่จะหมดใน 30 วัน
		"roles_expiring":      count(`SELECT COUNT(*) FROM role WHERE NVL(is_active,1) = 1 AND expire_date IS NOT NULL AND expire_date < SYSDATE + 30`),
		"user_roles_expiring": count(`SELECT COUNT(*) FROM user_role_mapping WHERE is_active = 1 AND expire_date IS NOT NULL AND expire_date < SYSDATE + 30`),
		"resps_no_role": count(`SELECT COUNT(*) FROM responsibility s WHERE NOT EXISTS (
			SELECT 1 FROM responsibility_role_mapping m WHERE m.responsibility_id = s.id)`),
	}

	// ประเภทผู้ใช้/บทบาทนับแบบเดียวกับหน้าเว็บ (lib/menuType normalizeUserType): agency|external = ภายนอก นอกนั้น = ภายใน
	// เปลี่ยนแปลงล่าสุด: บันทึกเป็นรายแถว → รวมเป็นรายการต่อนาที/บทบาท/ผู้ใช้/ชุด
	// หมายเหตุ: บันทึกไม่เก็บชื่อผู้ใช้ IAM-X ที่กด (เก็บแค่ผู้ใช้ฐานข้อมูล) จึงไม่แสดงว่าใครทำ
	changes := make([]dashboardChange, 0)
	rows, err := db.Query(`WITH a AS (
		 SELECT table_name t, action act, changed_at,
		  JSON_VALUE(NVL(new_value, old_value), '$.ROLE_ID') role_id,
		  JSON_VALUE(NVL(new_value, old_value), '$.USER_ID') user_id,
		  JSON_VALUE(NVL(new_value, old_value), '$.RESPONSIBILITY_ID') resp_id
		 FROM permission_audit_log
		 WHERE table_name IN ('ROLE_OBJECT_MAPPING','USER_ROLE_MAPPING','USER_RESPONSIBILITY_MAPPING','RESPONSIBILITY_ROLE_MAPPING')
		   AND action IN ('INSERT','DELETE')
		 ORDER BY id DESC FETCH FIRST 500 ROWS ONLY)
		SELECT a.t, a.act, TO_CHAR(MAX(a.changed_at), 'YYYY-MM-DD"T"HH24:MI'), COUNT(*),
		       MAX(r.code), MAX(NVL(TRIM(u.first_name || ' ' || u.last_name), u.user_name)), MAX(rs.name)
		FROM a
		LEFT JOIN role r ON r.id = a.role_id
		LEFT JOIN user_info u ON u.user_id = a.user_id
		LEFT JOIN responsibility rs ON TO_CHAR(rs.id) = a.resp_id
		GROUP BY a.t, a.act, TRUNC(a.changed_at, 'MI'), a.role_id, a.user_id, a.resp_id
		ORDER BY 3 DESC FETCH FIRST 10 ROWS ONLY`)
	if err != nil {
		log.Printf("dashboard changes error: %v", err)
	} else {
		defer rows.Close()
		for rows.Next() {
			var ch dashboardChange
			var role, user, resp sql.NullString
			if err := rows.Scan(&ch.Table, &ch.Action, &ch.At, &ch.Count, &role, &user, &resp); err != nil {
				log.Printf("dashboard changes scan error: %v", err)
				continue
			}
			ch.Role, ch.User, ch.Resp = role.String, user.String, resp.String
			changes = append(changes, ch)
		}
	}

	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"counts": counts, "changes": changes}})
}
