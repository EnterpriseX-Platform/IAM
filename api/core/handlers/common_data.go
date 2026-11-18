package handlers

import (
	"api/core"
	"api/core/models"

	"github.com/gofiber/fiber/v2"
)

func GetAccessTypeOptions(c *fiber.Ctx) error {
	db := core.GetDB()

	query := `
    SELECT RCD.COMMON_DATA_ID AS value,
           RCD.COMMON_DATA_LABEL AS label
    FROM APP.REF_COMMON_DATA RCD
    WHERE RCD.COMMON_DATA_TYPE = 'ACCESS_TYPE'
    ORDER BY RCD.COMMON_DATA_LABEL
  `

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch access type options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := make([]models.CommonData, 0)
	for rows.Next() {
		var opt models.CommonData
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Scan failed",
				"message": err.Error(),
			})
		}
		options = append(options, opt)
	}

	if err := rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Rows iteration failed",
			"message": err.Error(),
		})
	}

	return c.JSON(options)
}

func GetSystemTypeOptions(c *fiber.Ctx) error {
	db := core.GetDB()

	query := `
    SELECT RCD.COMMON_DATA_ID AS value,
           RCD.COMMON_DATA_LABEL AS label
    FROM APP.REF_COMMON_DATA RCD
    WHERE RCD.COMMON_DATA_TYPE = 'SYSTEM_TYPE_MAIN'
    ORDER BY RCD.COMMON_DATA_LABEL
  `

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch system type options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := make([]models.CommonData, 0)
	for rows.Next() {
		var opt models.CommonData
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Scan failed",
				"message": err.Error(),
			})
		}
		options = append(options, opt)
	}

	if err := rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Rows iteration failed",
			"message": err.Error(),
		})
	}

	return c.JSON(options)
}

// Debug endpoint to check all REF_COMMON_DATA
func GetAllCommonData(c *fiber.Ctx) error {
	db := core.GetDB()

	query := `SELECT COMMON_DATA_ID, COMMON_DATA_TYPE, COMMON_DATA_LABEL
	          FROM APP.REF_COMMON_DATA
			  WHERE COMMON_DATA_TYPE = 'ACCESS_TYPE'
	          ORDER BY COMMON_DATA_TYPE, COMMON_DATA_LABEL`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch common data",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	type CommonDataFull struct {
		ID    int    `json:"id"`
		Type  string `json:"type"`
		Label string `json:"label"`
	}

	data := []CommonDataFull{}
	for rows.Next() {
		var d CommonDataFull
		err := rows.Scan(&d.ID, &d.Type, &d.Label)
		if err != nil {
			continue
		}
		data = append(data, d)
	}

	return c.JSON(data)
}

func GetObjectTypeOptions(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	query := `
		SELECT TO_CHAR(id) AS value,
			   name        AS label
		FROM object_type
		ORDER BY name
	`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch object type options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := make([]models.CommonData, 0)
	for rows.Next() {
		var opt models.CommonData
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Scan failed",
				"message": err.Error(),
			})
		}
		options = append(options, opt)
	}

	if err := rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Rows iteration failed",
			"message": err.Error(),
		})
	}

	return c.JSON(options)
}

func GetMainProcessOptions(c *fiber.Ctx) error {
	db := core.GetDB()

	// คำนวณ fiscal year (ปีพุทธศักราช)
	// ถ้าวันนี้ < 1 ตุลาคม → ใช้ปีปัจจุบัน + 543
	// ถ้าวันนี้ >= 1 ตุลาคม → ใช้ปีปัจจุบัน + 543 + 1
	query := `
		SELECT PROCESS_CODE AS value,
		       DISPLAY_CODE || ' : ' || DISPLAY_NAME AS label
		FROM app.N_REF_PROCESS rp
		WHERE rp.FISCAL_YEAR = CASE
			WHEN EXTRACT(MONTH FROM SYSDATE) >= 10 THEN EXTRACT(YEAR FROM SYSDATE) + 543 + 1
			ELSE EXTRACT(YEAR FROM SYSDATE) + 543
		END
	`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch main process options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := make([]models.CommonData, 0)
	for rows.Next() {
		var opt models.CommonData
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Scan failed",
				"message": err.Error(),
			})
		}
		options = append(options, opt)
	}

	if err := rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Rows iteration failed",
			"message": err.Error(),
		})
	}

	return c.JSON(options)
}

func GetSubProcessOptions(c *fiber.Ctx) error {
	db := core.GetDB()

	// รับ mainProcessCode จาก query parameter
	mainProcessCode := c.Query("mainProcessId")

	if mainProcessCode != "" {
		// ถ้ามี mainProcessCode ให้ filter ตาม PROCESS_CODE และ FISCAL_YEAR (ปีพุทธศักราช)
		query := `
			SELECT rs.SUBPROCESS_CODE AS value,
			       rs.SUBPROCESS_CODE || ' : ' || rs.SUBPROCESS_NAME AS label
			FROM app.N_REF_PROCESS rp
			JOIN app.N_REF_SUBPROCESS rs ON rs.PROCESS_ID = rp.PROCESS_ID
			WHERE rp.PROCESS_CODE = :1
			  AND rp.FISCAL_YEAR = CASE
			      WHEN EXTRACT(MONTH FROM SYSDATE) >= 10 THEN EXTRACT(YEAR FROM SYSDATE) + 543 + 1
			      ELSE EXTRACT(YEAR FROM SYSDATE) + 543
			    END
			ORDER BY rs.SUBPROCESS_CODE
		`
		rows, err := db.Query(query, mainProcessCode)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to fetch sub process options",
				"message": err.Error(),
			})
		}
		defer rows.Close()

		options := make([]models.CommonData, 0)
		for rows.Next() {
			var opt models.CommonData
			if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":   "Scan failed",
					"message": err.Error(),
				})
			}
			options = append(options, opt)
		}

		if err := rows.Err(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Rows iteration failed",
				"message": err.Error(),
			})
		}

		return c.JSON(options)
	} else {
		// ถ้าไม่มี mainProcessCode ให้ดึงทั้งหมด grouped by parent (filter ตาม FISCAL_YEAR ปีพุทธศักราช)
		query := `
			SELECT rs.SUBPROCESS_CODE AS value,
			       rs.SUBPROCESS_CODE || ' : ' || rs.SUBPROCESS_NAME AS label,
			       rp.PROCESS_CODE AS parent_id
			FROM app.N_REF_PROCESS rp
			JOIN app.N_REF_SUBPROCESS rs ON rs.PROCESS_ID = rp.PROCESS_ID
			WHERE rp.FISCAL_YEAR = CASE
			      WHEN EXTRACT(MONTH FROM SYSDATE) >= 10 THEN EXTRACT(YEAR FROM SYSDATE) + 543 + 1
			      ELSE EXTRACT(YEAR FROM SYSDATE) + 543
			    END
			ORDER BY rp.PROCESS_CODE, rs.SUBPROCESS_CODE
		`
		rows, err := db.Query(query)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to fetch sub process options",
				"message": err.Error(),
			})
		}
		defer rows.Close()

		type SubProcessWithParent struct {
			Value    string `json:"value"`
			Label    string `json:"label"`
			ParentId string `json:"parentId"`
		}

		allOptions := make([]SubProcessWithParent, 0)
		for rows.Next() {
			var opt SubProcessWithParent
			if err := rows.Scan(&opt.Value, &opt.Label, &opt.ParentId); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":   "Scan failed",
					"message": err.Error(),
				})
			}
			allOptions = append(allOptions, opt)
		}

		if err := rows.Err(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Rows iteration failed",
				"message": err.Error(),
			})
		}

		return c.JSON(allOptions)
	}
}

func GetsystemOptions(c *fiber.Ctx) error {
	db := core.GetDB()

	query := `
		SELECT TO_CHAR(s.SYSTEM_ID) AS value,
			   s.SYSTEM_NAME      AS label
		FROM IAMX.SYSTEM s 
		ORDER BY s.SYSTEM_NAME
	`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch object type options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := make([]models.CommonData, 0)
	for rows.Next() {
		var opt models.CommonData
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Scan failed",
				"message": err.Error(),
			})
		}
		options = append(options, opt)
	}

	if err := rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Rows iteration failed",
			"message": err.Error(),
		})
	}

	return c.JSON(options)
}

func GetpermissionOptions(c *fiber.Ctx) error {
	db := core.GetDB()

	// รับ system จาก query parameter (รองรับทั้ง "system" และ "SYSTEM")
	system := c.Query("system")
	if system == "" {
		system = c.Query("SYSTEM")
	}

	if system != "" {
		// ถ้ามี system ให้ filter ตาม SYSTEM_ID
		query := `
			SELECT TO_CHAR(p.PERMISSION_ID) AS value,
                   p.PERMISSION_NAME AS label
            FROM IAMX.PERMISSION p
			WHERE p.SYSTEM_ID = :1
			ORDER BY p.PERMISSION_NAME
		`
		rows, err := db.Query(query, system)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to fetch permission options",
				"message": err.Error(),
			})
		}
		defer rows.Close()

		options := make([]models.CommonData, 0)
		for rows.Next() {
			var opt models.CommonData
			if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":   "Scan failed",
					"message": err.Error(),
				})
			}
			options = append(options, opt)
		}

		if err := rows.Err(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Rows iteration failed",
				"message": err.Error(),
			})
		}

		return c.JSON(options)
	} else {
		// ถ้าไม่มี system ให้ดึงทั้งหมด
		query := `
			SELECT TO_CHAR(p.PERMISSION_ID) AS value,
                   p.PERMISSION_NAME AS label
            FROM IAMX.PERMISSION p
			ORDER BY p.PERMISSION_ID, p.PERMISSION_NAME
		`
		rows, err := db.Query(query)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to fetch permission options",
				"message": err.Error(),
			})
		}
		defer rows.Close()

		options := make([]models.CommonData, 0)
		for rows.Next() {
			var opt models.CommonData
			if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":   "Scan failed",
					"message": err.Error(),
				})
			}
			options = append(options, opt)
		}

		if err := rows.Err(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Rows iteration failed",
				"message": err.Error(),
			})
		}

		return c.JSON(options)
	}
}

func GetParentObjectOptions(c *fiber.Ctx) error {
	db := core.GetDB()

	// รับ system จาก query parameter
	systemID := c.Query("systemId")

	if systemID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "systemId is required",
			"message": "Please provide systemId query parameter",
		})
	}

	query := `
		SELECT TO_CHAR(o.OBJECT_ID) AS value,
			   o.OBJECT_NAME AS label
		FROM IAMX."OBJECT" o
		WHERE o.SYSTEM_ID = :1 AND o.OBJECT_TYPE_ID = '-98'
		ORDER BY o.OBJECT_NAME
	`

	rows, err := db.Query(query, systemID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch parent object options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := make([]models.CommonData, 0)
	for rows.Next() {
		var opt models.CommonData
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Scan failed",
				"message": err.Error(),
			})
		}
		options = append(options, opt)
	}

	if err := rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Rows iteration failed",
			"message": err.Error(),
		})
	}

	return c.JSON(options)
}

func GetMenuParentObjectOptions(c *fiber.Ctx) error {
	db := core.GetDB()

	// รับ system จาก query parameter
	systemID := c.Query("systemId")

	if systemID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "systemId is required",
			"message": "Please provide systemId query parameter",
		})
	}

	query := `
		SELECT TO_CHAR(o.OBJECT_ID) AS value,
			   o.OBJECT_NAME AS label
		FROM IAMX."OBJECT" o
		WHERE o.SYSTEM_ID = :1 AND o.OBJECT_TYPE_ID = '6'
		ORDER BY o.OBJECT_NAME
	`

	rows, err := db.Query(query, systemID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch menu parent object options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := make([]models.CommonData, 0)
	for rows.Next() {
		var opt models.CommonData
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Scan failed",
				"message": err.Error(),
			})
		}
		options = append(options, opt)
	}

	if err := rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Rows iteration failed",
			"message": err.Error(),
		})
	}

	return c.JSON(options)
}
