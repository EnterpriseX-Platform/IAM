package handlers

import (
	"api/core"
	"database/sql"
	"fmt"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// ใส่คนเข้าชุด → สร้าง USER_ROLE_MAPPING ตาม role ในชุด (token/V_USER_EFFECTIVE_PERMISSION อ่านตารางเดิม)
// แถวที่ชุดสร้างจดไว้ใน RESPONSIBILITY_ROLE_GRANT → ถอดออกลบเฉพาะแถวนั้น ไม่แตะ role ที่ให้เองแยก
// endpoint ใหม่สำหรับหน้าตั้งค่าเท่านั้น ไม่แตะ endpoint เดิมที่ระบบอื่นเรียกใช้

func respDB(c *fiber.Ctx) *sql.DB {
	db := core.GetDB()
	if db == nil {
		c.Status(500).JSON(fiber.Map{"success": false, "message": "เชื่อมต่อฐานข้อมูลไม่ได้"})
	}
	return db
}

func respFail(c *fiber.Ctx, where string, err error) error {
	log.Printf("%s error: %v", where, err)
	return c.Status(500).JSON(fiber.Map{"success": false, "message": "บันทึกไม่สำเร็จ กรุณาลองใหม่"})
}

// GET /directory/resp-ux — รายการความรับผิดชอบ + จำนวนคน/บทบาท
func GetRespList(c *fiber.Ctx) error {
	db := respDB(c)
	if db == nil {
		return nil
	}
	rows, err := db.Query(`
		SELECT r.ID, r.CODE, r.NAME, NVL(r.DESCRIPTION, ' '), r.IS_ACTIVE, NVL(r.APPLICANT_TYPE, ' '), NVL(r.AGENCY_LEVEL, ' '), NVL(r.PARENT_ID, 0), NVL(r.GROUP_CODE, ' '),
		       (SELECT COUNT(*) FROM IAMX.RESPONSIBILITY_AGENCY a WHERE a.RESPONSIBILITY_ID = r.ID),
		       (SELECT COUNT(*) FROM IAMX.USER_RESPONSIBILITY_MAPPING u WHERE u.RESPONSIBILITY_ID = r.ID AND u.IS_ACTIVE = 1),
		       (SELECT COUNT(*) FROM IAMX.RESPONSIBILITY_ROLE_MAPPING m WHERE m.RESPONSIBILITY_ID = r.ID AND m.IS_ACTIVE = 1)
		  FROM IAMX.RESPONSIBILITY r
		 ORDER BY r.NAME`)
	if err != nil {
		return respFail(c, "GetRespList", err)
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var id, active, users, roles, parent, agencies int64
		var code, name, desc, appType, level, grp string
		if err := rows.Scan(&id, &code, &name, &desc, &active, &appType, &level, &parent, &grp, &agencies, &users, &roles); err != nil {
			continue
		}
		if desc == " " {
			desc = ""
		}
		out = append(out, fiber.Map{"id": id, "code": code, "name": name, "description": desc, "is_active": active, "user_count": users, "role_count": roles,
			"applicant_type": strings.TrimSpace(appType), "agency_level": strings.TrimSpace(level), "parent_id": parent, "agency_count": agencies, "group_code": strings.TrimSpace(grp)})
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}

// GET /directory/resp-ux/:id — บทบาทในชุด + คนในชุด
func GetRespDetail(c *fiber.Ctx) error {
	id := c.Params("id")
	db := respDB(c)
	if db == nil {
		return nil
	}
	roles := []fiber.Map{}
	rr, err := db.Query(`
		SELECT ro.ID, ro.CODE, ro.NAME,
		       (SELECT COUNT(*) FROM IAMX.USER_ROLE_MAPPING u WHERE u.ROLE_ID = ro.ID AND u.IS_ACTIVE = 1)
		  FROM IAMX.RESPONSIBILITY_ROLE_MAPPING m
		  JOIN IAMX.ROLE ro ON ro.ID = m.ROLE_ID
		 WHERE m.RESPONSIBILITY_ID = :1 AND m.IS_ACTIVE = 1
		 ORDER BY m.ID`, id)
	if err != nil {
		return respFail(c, "GetRespDetail roles", err)
	}
	for rr.Next() {
		var rid, code string
		var name sql.NullString
		var n int64
		if err := rr.Scan(&rid, &code, &name, &n); err == nil {
			roles = append(roles, fiber.Map{"id": rid, "code": code, "name": name.String, "user_count": n})
		}
	}
	rr.Close()

	users := []fiber.Map{}
	ur, err := db.Query(`
		SELECT ui.USER_ID, NVL(TRIM(ui.FIRST_NAME || ' ' || ui.LAST_NAME), ui.USER_NAME), NVL(ui.EMAIL, ui.USER_NAME),
		       (SELECT COUNT(*) FROM IAMX.USER_CUSTOM_OBJECT_MAPPING x WHERE x.USER_ID = ui.USER_ID AND x.IS_ACTIVE = 1)
		  FROM IAMX.USER_RESPONSIBILITY_MAPPING u
		  JOIN IAMX.USER_INFO ui ON ui.USER_ID = u.USER_ID
		 WHERE u.RESPONSIBILITY_ID = :1 AND u.IS_ACTIVE = 1
		 ORDER BY 2`, id)
	if err != nil {
		return respFail(c, "GetRespDetail users", err)
	}
	for ur.Next() {
		var uid string
		var name, email sql.NullString
		var custom int64
		if err := ur.Scan(&uid, &name, &email, &custom); err == nil {
			users = append(users, fiber.Map{"user_id": uid, "name": name.String, "email": email.String, "custom_count": custom})
		}
	}
	ur.Close()
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"roles": roles, "users": users}})
}

// ให้ role กับคน 1 คนในนามชุด (ถ้ามีอยู่แล้วไม่สร้างซ้ำ ไม่จด → ถอดชุดทีหลังไม่ลบของเดิม)
func grantRoleForResp(tx *sql.Tx, respID, userID, roleID string) error {
	var n int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM IAMX.USER_ROLE_MAPPING WHERE USER_ID = :1 AND ROLE_ID = :2 AND IS_ACTIVE = 1`, userID, roleID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	var urmID int64
	if _, err := tx.Exec(`
		INSERT INTO IAMX.USER_ROLE_MAPPING (USER_ID, ROLE_ID, EFFECTIVE_DATE, IS_ACTIVE, CREATED_AT)
		VALUES (:1, :2, TRUNC(SYSDATE), 1, SYSTIMESTAMP) RETURNING ID INTO :3`,
		userID, roleID, sql.Out{Dest: &urmID}); err != nil {
		return err
	}
	_, err := tx.Exec(`INSERT INTO IAMX.RESPONSIBILITY_ROLE_GRANT (RESPONSIBILITY_ID, USER_ID, ROLE_ID, USER_ROLE_MAPPING_ID) VALUES (:1, :2, :3, :4)`,
		respID, userID, roleID, urmID)
	return err
}

// ถอด role ที่ชุดเคยให้ (เฉพาะแถวที่จดไว้) — roleID ว่าง = ทุก role ของชุดนี้
func revokeRespGrants(tx *sql.Tx, respID, userID, roleID string) error {
	q := `SELECT ID, USER_ROLE_MAPPING_ID FROM IAMX.RESPONSIBILITY_ROLE_GRANT WHERE RESPONSIBILITY_ID = :1`
	args := []interface{}{respID}
	if userID != "" {
		q += ` AND USER_ID = :2`
		args = append(args, userID)
	}
	if roleID != "" {
		q += ` AND ROLE_ID = :` + map[bool]string{true: "3", false: "2"}[userID != ""]
		args = append(args, roleID)
	}
	rows, err := tx.Query(q, args...)
	if err != nil {
		return err
	}
	type g struct{ id, urm int64 }
	list := []g{}
	for rows.Next() {
		var x g
		if rows.Scan(&x.id, &x.urm) == nil {
			list = append(list, x)
		}
	}
	rows.Close()
	for _, x := range list {
		if _, err := tx.Exec(`DELETE FROM IAMX.USER_ROLE_MAPPING WHERE ID = :1`, x.urm); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM IAMX.RESPONSIBILITY_ROLE_GRANT WHERE ID = :1`, x.id); err != nil {
			return err
		}
	}
	return nil
}

func respUsers(tx *sql.Tx, respID string) ([]string, error) {
	rows, err := tx.Query(`SELECT USER_ID FROM IAMX.USER_RESPONSIBILITY_MAPPING WHERE RESPONSIBILITY_ID = :1 AND IS_ACTIVE = 1`, respID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var u string
		if rows.Scan(&u) == nil {
			out = append(out, u)
		}
	}
	return out, nil
}

func respRoles(tx *sql.Tx, respID string) ([]string, error) {
	rows, err := tx.Query(`SELECT ROLE_ID FROM IAMX.RESPONSIBILITY_ROLE_MAPPING WHERE RESPONSIBILITY_ID = :1 AND IS_ACTIVE = 1 AND ROLE_ID IS NOT NULL`, respID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var r string
		if rows.Scan(&r) == nil {
			out = append(out, r)
		}
	}
	return out, nil
}

// POST /directory/resp-ux/:id/roles {role_id} — เพิ่มบทบาทเข้าชุด + ให้ทุกคนในชุด
func AddRespRole(c *fiber.Ctx) error {
	id := c.Params("id")
	var in struct {
		RoleID string `json:"role_id"`
	}
	if err := c.BodyParser(&in); err != nil || in.RoleID == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "กรุณาเลือกบทบาท"})
	}
	db := respDB(c)
	if db == nil {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return respFail(c, "AddRespRole", err)
	}
	defer tx.Rollback()
	var n int
	tx.QueryRow(`SELECT COUNT(*) FROM IAMX.RESPONSIBILITY_ROLE_MAPPING WHERE RESPONSIBILITY_ID = :1 AND ROLE_ID = :2 AND IS_ACTIVE = 1`, id, in.RoleID).Scan(&n)
	if n == 0 {
		if _, err := tx.Exec(`INSERT INTO IAMX.RESPONSIBILITY_ROLE_MAPPING (RESPONSIBILITY_ID, ROLE_ID, EFFECTIVE_DATE, IS_ACTIVE, CREATED_AT, UPDATED_AT)
			VALUES (:1, :2, TRUNC(SYSDATE), 1, SYSTIMESTAMP, SYSTIMESTAMP)`, id, in.RoleID); err != nil {
			return respFail(c, "AddRespRole insert", err)
		}
	}
	users, err := respUsers(tx, id)
	if err != nil {
		return respFail(c, "AddRespRole users", err)
	}
	for _, u := range users {
		if err := grantRoleForResp(tx, id, u, in.RoleID); err != nil {
			return respFail(c, "AddRespRole grant", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return respFail(c, "AddRespRole commit", err)
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /directory/resp-ux/:id/roles/:roleId — เอาบทบาทออกจากชุด + ถอดจากคนที่ชุดเคยให้
func RemoveRespRole(c *fiber.Ctx) error {
	id, roleID := c.Params("id"), c.Params("roleId")
	db := respDB(c)
	if db == nil {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return respFail(c, "RemoveRespRole", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM IAMX.RESPONSIBILITY_ROLE_MAPPING WHERE RESPONSIBILITY_ID = :1 AND ROLE_ID = :2`, id, roleID); err != nil {
		return respFail(c, "RemoveRespRole delete", err)
	}
	if err := revokeRespGrants(tx, id, "", roleID); err != nil {
		return respFail(c, "RemoveRespRole revoke", err)
	}
	if err := tx.Commit(); err != nil {
		return respFail(c, "RemoveRespRole commit", err)
	}
	return c.JSON(fiber.Map{"success": true})
}

// POST /directory/resp-ux/:id/users {user_id} — ใส่คนเข้าชุด + ให้ทุกบทบาทในชุด
func AddRespUser(c *fiber.Ctx) error {
	id := c.Params("id")
	var in struct {
		UserID string `json:"user_id"`
	}
	if err := c.BodyParser(&in); err != nil || in.UserID == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "กรุณาเลือกผู้ใช้"})
	}
	db := respDB(c)
	if db == nil {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return respFail(c, "AddRespUser", err)
	}
	defer tx.Rollback()
	var n int
	tx.QueryRow(`SELECT COUNT(*) FROM IAMX.USER_RESPONSIBILITY_MAPPING WHERE RESPONSIBILITY_ID = :1 AND USER_ID = :2 AND IS_ACTIVE = 1`, id, in.UserID).Scan(&n)
	if n == 0 {
		if _, err := tx.Exec(`INSERT INTO IAMX.USER_RESPONSIBILITY_MAPPING (USER_ID, RESPONSIBILITY_ID, PRIORITY, EFFECTIVE_DATE, IS_ACTIVE, CREATED_AT, UPDATED_AT)
			VALUES (:1, :2, 2, TRUNC(SYSDATE), 1, SYSTIMESTAMP, SYSTIMESTAMP)`, in.UserID, id); err != nil {
			return respFail(c, "AddRespUser insert", err)
		}
	}
	roles, err := respRoles(tx, id)
	if err != nil {
		return respFail(c, "AddRespUser roles", err)
	}
	for _, r := range roles {
		if err := grantRoleForResp(tx, id, in.UserID, r); err != nil {
			return respFail(c, "AddRespUser grant", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return respFail(c, "AddRespUser commit", err)
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /directory/resp-ux/:id/users/:userId — เอาคนออกจากชุด + ถอดเฉพาะ role ที่ชุดให้
func RemoveRespUser(c *fiber.Ctx) error {
	id, userID := c.Params("id"), c.Params("userId")
	db := respDB(c)
	if db == nil {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return respFail(c, "RemoveRespUser", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM IAMX.USER_RESPONSIBILITY_MAPPING WHERE RESPONSIBILITY_ID = :1 AND USER_ID = :2`, id, userID); err != nil {
		return respFail(c, "RemoveRespUser delete", err)
	}
	if err := revokeRespGrants(tx, id, userID, ""); err != nil {
		return respFail(c, "RemoveRespUser revoke", err)
	}
	if err := tx.Commit(); err != nil {
		return respFail(c, "RemoveRespUser commit", err)
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /directory/resp-ux/:id — ลบชุด: ถอด role ที่ชุดให้ทุกคน + ลบคน/บทบาทในชุด + ลบชุด
func DeleteResp(c *fiber.Ctx) error {
	id := c.Params("id")
	db := respDB(c)
	if db == nil {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return respFail(c, "DeleteResp", err)
	}
	defer tx.Rollback()
	if err := revokeRespGrants(tx, id, "", ""); err != nil {
		return respFail(c, "DeleteResp revoke", err)
	}
	for _, q := range []string{
		`DELETE FROM IAMX.USER_RESPONSIBILITY_MAPPING WHERE RESPONSIBILITY_ID = :1`,
		`DELETE FROM IAMX.RESPONSIBILITY_ROLE_MAPPING WHERE RESPONSIBILITY_ID = :1`,
		`DELETE FROM IAMX.RESPONSIBILITY WHERE ID = :1`,
	} {
		if _, err := tx.Exec(q, id); err != nil {
			return respFail(c, "DeleteResp", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return respFail(c, "DeleteResp commit", err)
	}
	return c.JSON(fiber.Map{"success": true})
}

// GET /directory/resp-ux/:id/history — ประวัติเพิ่ม/เอาออก บทบาทและคนในชุด (จาก PERMISSION_AUDIT_LOG)
func GetRespHistory(c *fiber.Ctx) error {
	id := c.Params("id")
	db := respDB(c)
	if db == nil {
		return nil
	}
	rows, err := db.Query(`
		SELECT a.TABLE_NAME, a.ACTION, NVL(a.CHANGED_BY, '-'), TO_CHAR(a.CHANGED_AT, 'YYYY-MM-DD"T"HH24:MI:SS'),
		       NVL(ro.NAME, NVL(ro.CODE, ' ')), NVL(ro.CODE, ' '),
		       NVL(TRIM(ui.FIRST_NAME || ' ' || ui.LAST_NAME), NVL(ui.USER_NAME, ' '))
		  FROM IAMX.PERMISSION_AUDIT_LOG a
		  LEFT JOIN IAMX.ROLE ro ON ro.ID = JSON_VALUE(NVL(a.NEW_VALUE, a.OLD_VALUE), '$.ROLE_ID')
		  LEFT JOIN IAMX.USER_INFO ui ON ui.USER_ID = JSON_VALUE(NVL(a.NEW_VALUE, a.OLD_VALUE), '$.USER_ID')
		 WHERE a.TABLE_NAME IN ('RESPONSIBILITY_ROLE_MAPPING', 'USER_RESPONSIBILITY_MAPPING')
		   AND a.ACTION IN ('INSERT', 'DELETE')
		   AND JSON_VALUE(NVL(a.NEW_VALUE, a.OLD_VALUE), '$.RESPONSIBILITY_ID') = :1
		 ORDER BY a.CHANGED_AT DESC
		 FETCH FIRST 200 ROWS ONLY`, id)
	if err != nil {
		return respFail(c, "GetRespHistory", err)
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var tbl, act, by, at, roleName, roleCode, userName string
		if rows.Scan(&tbl, &act, &by, &at, &roleName, &roleCode, &userName) != nil {
			continue
		}
		out = append(out, fiber.Map{"kind": map[bool]string{true: "role", false: "user"}[tbl == "RESPONSIBILITY_ROLE_MAPPING"],
			"action": act, "by": by, "at": at, "role_name": roleName, "role_code": roleCode, "user_name": userName})
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}

// PUT /directory/resp-ux/:id/register — ประเภทผู้สมัครที่เลือกได้ตอนสมัคร + ระดับหน่วยงาน (ภายนอก)
func SetRespRegister(c *fiber.Ctx) error {
	id := c.Params("id")
	var in struct {
		ApplicantType string `json:"applicant_type"`
		AgencyLevel   string `json:"agency_level"`
		ParentID      int64  `json:"parent_id"`
	}
	if err := c.BodyParser(&in); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "ข้อมูลไม่ถูกต้อง"})
	}
	okType := map[string]bool{"": true, "INTERNAL": true, "EXTERNAL": true, "BOTH": true}
	okLevel := map[string]bool{"": true, "MIN": true, "AGC": true, "SUB_AGC": true}
	if !okType[in.ApplicantType] || !okLevel[in.AgencyLevel] {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "ข้อมูลไม่ถูกต้อง"})
	}
	if in.ApplicantType != "EXTERNAL" && in.ApplicantType != "BOTH" {
		in.AgencyLevel = ""
	}
	db := respDB(c)
	if db == nil {
		return nil
	}
	if fmt.Sprint(in.ParentID) == id {
		in.ParentID = 0
	}
	if _, err := db.Exec(`UPDATE IAMX.RESPONSIBILITY SET APPLICANT_TYPE = :1, AGENCY_LEVEL = :2, PARENT_ID = :3, UPDATED_AT = SYSTIMESTAMP WHERE ID = :4`,
		sql.NullString{String: in.ApplicantType, Valid: in.ApplicantType != ""},
		sql.NullString{String: in.AgencyLevel, Valid: in.AgencyLevel != ""},
		sql.NullInt64{Int64: in.ParentID, Valid: in.ParentID > 0}, id); err != nil {
		return respFail(c, "SetRespRegister", err)
	}
	return c.JSON(fiber.Map{"success": true})
}

// GET /directory/resp-ux/agency-options?type=ORG_DEPT|AGC — ตัวเลือกหน่วยงาน (สำนัก/กองภายในองค์กร หรือ กระทรวง/กรม)
func GetRespAgencyOptions(c *fiber.Ctx) error {
	db := respDB(c)
	if db == nil {
		return nil
	}
	q := `SELECT AGC_ID, AGC_NAME, DATA_LEVEL_TYPE FROM APP.M_AGC WHERE STATUS = 'active' AND DATA_LEVEL_TYPE IN ('MIN','AGC') ORDER BY DATA_LEVEL_TYPE DESC, AGC_NAME`
	if c.Query("type") == "ORG_DEPT" {
		q = `SELECT TO_CHAR(DEPARTMENT_ID), MAX(REGEXP_REPLACE(DEPARTMENT_NAME, '^\s*[0-9]+\s*:\s*', '')), 'ORG_DEPT'
		       FROM APP.M_EMPLOYEE WHERE DEPARTMENT_ID IS NOT NULL AND DEPARTMENT_NAME IS NOT NULL
		      GROUP BY TO_CHAR(DEPARTMENT_ID) ORDER BY 2`
	}
	rows, err := db.Query(q)
	if err != nil {
		return respFail(c, "GetRespAgencyOptions", err)
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var id, name, lv sql.NullString
		if rows.Scan(&id, &name, &lv) == nil {
			out = append(out, fiber.Map{"id": id.String, "name": name.String, "level": lv.String})
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}

// GET /directory/resp-ux/:id/agencies — หน่วยงานที่ใช้ชุดนี้ได้ (ว่าง = ทุกหน่วยงาน)
func GetRespAgencies(c *fiber.Ctx) error {
	db := respDB(c)
	if db == nil {
		return nil
	}
	rows, err := db.Query(`SELECT AGENCY_TYPE, AGENCY_ID, NVL(AGENCY_NAME, AGENCY_ID) FROM IAMX.RESPONSIBILITY_AGENCY WHERE RESPONSIBILITY_ID = :1 ORDER BY 3`, c.Params("id"))
	if err != nil {
		return respFail(c, "GetRespAgencies", err)
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var t, id, name string
		if rows.Scan(&t, &id, &name) == nil {
			out = append(out, fiber.Map{"type": t, "id": id, "name": name})
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}

// PUT /directory/resp-ux/:id/agencies {items:[{type,id,name}]} — แทนทั้งชุด
func SetRespAgencies(c *fiber.Ctx) error {
	id := c.Params("id")
	var in struct {
		Items []struct {
			Type string `json:"type"`
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"items"`
	}
	if err := c.BodyParser(&in); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "ข้อมูลไม่ถูกต้อง"})
	}
	db := respDB(c)
	if db == nil {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return respFail(c, "SetRespAgencies", err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM IAMX.RESPONSIBILITY_AGENCY WHERE RESPONSIBILITY_ID = :1`, id); err != nil {
		return respFail(c, "SetRespAgencies delete", err)
	}
	for _, it := range in.Items {
		if (it.Type != "ORG_DEPT" && it.Type != "AGC") || it.ID == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO IAMX.RESPONSIBILITY_AGENCY (RESPONSIBILITY_ID, AGENCY_TYPE, AGENCY_ID, AGENCY_NAME) VALUES (:1, :2, :3, :4)`,
			id, it.Type, it.ID, it.Name); err != nil {
			return respFail(c, "SetRespAgencies insert", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return respFail(c, "SetRespAgencies commit", err)
	}
	return c.JSON(fiber.Map{"success": true})
}

// GET /directory/resp-ux/by-user/:userId — 20/10/69 หน้าผู้ใช้แยกแท็บความรับผิดชอบ/บทบาท
// คืนชุดที่คนนี้อยู่ + บทบาทที่ได้จากชุด (RESPONSIBILITY_ROLE_GRANT) เพื่อบอกที่มาของบทบาท
func GetRespByUser(c *fiber.Ctx) error {
	userID := c.Params("userId")
	db := respDB(c)
	if db == nil {
		return nil
	}
	rows, err := db.Query(`
		SELECT r.ID, r.CODE, r.NAME,
		       (SELECT COUNT(*) FROM IAMX.RESPONSIBILITY_ROLE_MAPPING m WHERE m.RESPONSIBILITY_ID = r.ID AND m.IS_ACTIVE = 1)
		  FROM IAMX.USER_RESPONSIBILITY_MAPPING u JOIN IAMX.RESPONSIBILITY r ON r.ID = u.RESPONSIBILITY_ID
		 WHERE u.USER_ID = :1 AND u.IS_ACTIVE = 1
		 ORDER BY r.NAME`, userID)
	if err != nil {
		return respFail(c, "GetRespByUser", err)
	}
	resps := []fiber.Map{}
	for rows.Next() {
		var id, roles int64
		var code, name string
		if rows.Scan(&id, &code, &name, &roles) == nil {
			resps = append(resps, fiber.Map{"id": id, "code": code, "name": name, "role_count": roles})
		}
	}
	rows.Close()
	grows, err := db.Query(`
		SELECT g.ROLE_ID, r.ID, r.NAME
		  FROM IAMX.RESPONSIBILITY_ROLE_GRANT g JOIN IAMX.RESPONSIBILITY r ON r.ID = g.RESPONSIBILITY_ID
		 WHERE g.USER_ID = :1`, userID)
	if err != nil {
		return respFail(c, "GetRespByUser grants", err)
	}
	defer grows.Close()
	grants := []fiber.Map{}
	for grows.Next() {
		var roleID, name string
		var rid int64
		if grows.Scan(&roleID, &rid, &name) == nil {
			grants = append(grants, fiber.Map{"role_id": roleID, "resp_id": rid, "resp_name": name})
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"responsibilities": resps, "grants": grants}})
}
