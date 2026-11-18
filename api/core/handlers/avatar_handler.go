package handlers

import (
	"api/core"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// รูปโปรไฟล์เก็บใน IAMX.user_profile_image (ตารางแยก ไม่ใช่คอลัมน์ใน user_info)
// เพราะ user_info เป็นต้นทางของ view APP.USER_INFO และมีตารางลูกอ้าง FK อยู่
// การเอา BLOB ไปไว้ในนั้นจะทำให้ทุก SELECT ของโปรไฟล์ลากรูปติดมาด้วย
const (
	maxAvatarBytes = 2 * 1024 * 1024 // 2 MB — ตรงกับ CHECK constraint ck_upi_size
)

// ชนิดไฟล์ที่ยอมรับ ตรวจจาก "เนื้อไฟล์จริง" ไม่ใช่จาก Content-Type ที่ผู้เรียกส่งมา
// (ผู้เรียกแก้ header ได้ตามใจ จึงเชื่อไม่ได้)
var allowedAvatarTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
}

// GetMyAvatar handles GET /iamx/api/{me,public/me}/avatar
// คืนไบต์ของรูปพร้อม Content-Type จริง ถ้ายังไม่เคยอัปโหลดจะได้ 404
func (h *MenuHandler) GetMyAvatar(c *fiber.Ctx) error {
	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil // response already written by resolveRefUserID
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database connection not available",
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var (
		mimeType string
		data     []byte
		updated  time.Time
	)
	err := oracleDB.QueryRowContext(ctx,
		`SELECT mime_type, image_data, updated_date FROM user_profile_image WHERE user_id = :1`,
		refUserID,
	).Scan(&mimeType, &data, &updated)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "no profile image"})
	}
	if err != nil {
		fmt.Printf("[Avatar] read failed for %s: %v\n", refUserID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read profile image"})
	}

	// ETag จากเวลาที่แก้ล่าสุด ทำให้เบราว์เซอร์ไม่ต้องโหลดรูปซ้ำทุกครั้งที่เปิดจอ
	etag := fmt.Sprintf(`W/"%d"`, updated.UnixNano())
	if match := c.Get("If-None-Match"); match != "" && match == etag {
		return c.SendStatus(fiber.StatusNotModified)
	}

	c.Set(fiber.HeaderContentType, mimeType)
	c.Set(fiber.HeaderETag, etag)
	// private เท่านั้น — รูปนี้เป็นของผู้ใช้คนเดียว ห้ามให้ proxy กลางแคชแล้ว
	// จ่ายให้คนอื่น
	c.Set(fiber.HeaderCacheControl, "private, max-age=0, must-revalidate")
	return c.Send(data)
}

// UpdateMyAvatar handles PUT /iamx/api/{me,public/me}/avatar
// รับได้ทั้ง multipart (field ชื่อ "file") และ raw body
func (h *MenuHandler) UpdateMyAvatar(c *fiber.Ctx) error {
	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil
	}

	data, err := readAvatarBody(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	if len(data) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "empty image"})
	}
	if len(data) > maxAvatarBytes {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
			"error": "image must not exceed 2 MB",
		})
	}

	// ตรวจชนิดจากเนื้อไฟล์จริง กัน .exe เปลี่ยนนามสกุลแล้วส่งมาเป็นรูป
	mimeType := http.DetectContentType(data)
	if i := strings.IndexByte(mimeType, ';'); i >= 0 {
		mimeType = strings.TrimSpace(mimeType[:i])
	}
	if !allowedAvatarTypes[mimeType] {
		return c.Status(fiber.StatusUnsupportedMediaType).JSON(fiber.Map{
			"error":    "unsupported image type",
			"detected": mimeType,
		})
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database connection not available",
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// MERGE ทำให้อัปโหลดซ้ำเป็นการทับรูปเดิม ไม่ใช่ error ซ้ำคีย์
	_, err = oracleDB.ExecContext(ctx, `
		MERGE INTO user_profile_image t
		USING (SELECT :1 AS user_id FROM dual) s
		   ON (t.user_id = s.user_id)
		 WHEN MATCHED THEN UPDATE SET
		        t.mime_type    = :2,
		        t.byte_size    = :3,
		        t.image_data   = :4,
		        t.updated_date = SYSTIMESTAMP
		 WHEN NOT MATCHED THEN INSERT (user_id, mime_type, byte_size, image_data, updated_date)
		      VALUES (:5, :6, :7, :8, SYSTIMESTAMP)`,
		refUserID, mimeType, len(data), data,
		refUserID, mimeType, len(data), data,
	)
	if err != nil {
		fmt.Printf("[Avatar] write failed for %s: %v\n", refUserID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to save profile image",
		})
	}

	return c.JSON(fiber.Map{
		"success":   true,
		"refUserId": refUserID,
		"mimeType":  mimeType,
		"byteSize":  len(data),
	})
}

// DeleteMyAvatar handles DELETE /iamx/api/{me,public/me}/avatar
func (h *MenuHandler) DeleteMyAvatar(c *fiber.Ctx) error {
	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database connection not available",
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if _, err := oracleDB.ExecContext(ctx,
		`DELETE FROM user_profile_image WHERE user_id = :1`, refUserID); err != nil {
		fmt.Printf("[Avatar] delete failed for %s: %v\n", refUserID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to delete profile image",
		})
	}

	return c.JSON(fiber.Map{"success": true, "refUserId": refUserID})
}

// readAvatarBody ดึงไบต์รูปออกมา รองรับทั้ง multipart และ raw body
func readAvatarBody(c *fiber.Ctx) ([]byte, error) {
	ct := c.Get(fiber.HeaderContentType)
	if strings.HasPrefix(ct, "multipart/form-data") {
		fh, err := c.FormFile("file")
		if err != nil {
			return nil, fmt.Errorf("multipart body must contain a %q field", "file")
		}
		if fh.Size > maxAvatarBytes {
			return nil, fmt.Errorf("image must not exceed 2 MB")
		}
		f, err := fh.Open()
		if err != nil {
			return nil, fmt.Errorf("cannot read uploaded file")
		}
		defer f.Close()
		// อ่านเกินลิมิตไป 1 ไบต์ เพื่อแยกกรณี "พอดีลิมิต" กับ "เกินลิมิต"
		return io.ReadAll(io.LimitReader(f, maxAvatarBytes+1))
	}
	return c.Body(), nil
}

// GET/PUT/DELETE /directory/users/:id/avatar — :id = user_info.user_id (คีย์เดียวกับ user_profile_image)

func GetUserAvatarAdmin(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"error": "Oracle database connection not available"})
	}
	var mimeType string
	var data []byte
	var updated time.Time
	err := db.QueryRow(`SELECT mime_type, image_data, updated_date FROM user_profile_image WHERE user_id = :1`, c.Params("id")).Scan(&mimeType, &data, &updated)
	if err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "no profile image"})
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to read profile image"})
	}
	c.Set(fiber.HeaderContentType, mimeType)
	c.Set(fiber.HeaderCacheControl, "private, max-age=0, must-revalidate")
	return c.Send(data)
}

func UpdateUserAvatarAdmin(c *fiber.Ctx) error {
	id := c.Params("id")
	data, err := readAvatarBody(c)
	if err != nil || len(data) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาเลือกรูป"})
	}
	if len(data) > maxAvatarBytes {
		return c.Status(413).JSON(fiber.Map{"error": "รูปต้องไม่เกิน 2 MB"})
	}
	mimeType := http.DetectContentType(data)
	if i := strings.IndexByte(mimeType, ';'); i >= 0 {
		mimeType = strings.TrimSpace(mimeType[:i])
	}
	if !allowedAvatarTypes[mimeType] {
		return c.Status(415).JSON(fiber.Map{"error": "รองรับเฉพาะไฟล์รูป PNG / JPG / WEBP"})
	}
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"error": "Oracle database connection not available"})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := db.ExecContext(ctx, `
		MERGE INTO user_profile_image t
		USING (SELECT :1 AS user_id FROM dual) s ON (t.user_id = s.user_id)
		 WHEN MATCHED THEN UPDATE SET t.mime_type = :2, t.byte_size = :3, t.image_data = :4, t.updated_date = SYSTIMESTAMP
		 WHEN NOT MATCHED THEN INSERT (user_id, mime_type, byte_size, image_data, updated_date) VALUES (:5, :6, :7, :8, SYSTIMESTAMP)`,
		id, mimeType, len(data), data, id, mimeType, len(data), data); err != nil {
		fmt.Printf("[Avatar admin] write failed for %s: %v\n", id, err)
		return c.Status(500).JSON(fiber.Map{"error": "บันทึกรูปไม่สำเร็จ"})
	}
	return c.JSON(fiber.Map{"success": true})
}

func DeleteUserAvatarAdmin(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"error": "Oracle database connection not available"})
	}
	if _, err := db.Exec(`DELETE FROM user_profile_image WHERE user_id = :1`, c.Params("id")); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ลบรูปไม่สำเร็จ"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// GET /directory/users/avatar-ids — รายชื่อ user_id ที่มีรูป (จอรายการผู้ใช้โหลดรูปเฉพาะคนที่มี ไม่ยิง 404 ทีละคน)
func ListUserAvatarIDs(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"error": "Oracle database connection not available"})
	}
	rows, err := db.Query(`SELECT user_id, TO_CHAR(updated_date, 'YYYYMMDDHH24MISS') FROM user_profile_image`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, v string
		if rows.Scan(&id, &v) == nil {
			out[id] = v
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}
