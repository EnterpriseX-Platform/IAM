package handlers

import (
	"api/core"
	"database/sql"
	"log"

	"github.com/gofiber/fiber/v2"
)

type GeoOption struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// GetRefRegions - GET /admin/ref/regions
// Lists all active regions from APP.REF_REGION.
func GetRefRegions(c *fiber.Ctx) error {
	db := core.GetDB()
	query := `
		SELECT REGION_ID, REGION_NAME
		FROM APP.REF_REGION
		WHERE ` + activeFilter(db, "REF_REGION", "") + `
		ORDER BY REGION_NAME
	`
	rows, err := db.Query(query)
	if err != nil {
		log.Printf("GetRefRegions error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	defer rows.Close()

	var result []GeoOption
	for rows.Next() {
		var o GeoOption
		var name sql.NullString
		if err := rows.Scan(&o.ID, &name); err != nil {
			log.Printf("GetRefRegions scan error: %v", err)
			continue
		}
		if name.Valid {
			o.Name = name.String
		}
		result = append(result, o)
	}
	return c.JSON(fiber.Map{"success": true, "data": result})
}

// GetRefProvinceDistricts - GET /admin/ref/province-districts?region_id=
// Lists province-districts (เขตพื้นที่), optionally filtered by region.
func GetRefProvinceDistricts(c *fiber.Ctx) error {
	db := core.GetDB()
	regionID := c.Query("region_id")

	var (
		query string
		rows  *sql.Rows
		err   error
	)

	if regionID != "" {
		query = `
			SELECT DISTINCT pd.PROVINCE_DISTRICT_ID, pd.PROVINCE_DISTRICT_NAME
			FROM APP.REF_PROVINCE_DISTRICT pd
			JOIN APP.REF_PROVINCE p ON p.REF_DISTRICT_ID = pd.PROVINCE_DISTRICT_ID
			WHERE p.REGION_ID = :1
			  AND ` + activeFilter(db, "REF_PROVINCE_DISTRICT", "pd") + `
			ORDER BY pd.PROVINCE_DISTRICT_NAME
		`
		rows, err = db.Query(query, regionID)
	} else {
		query = `
			SELECT PROVINCE_DISTRICT_ID, PROVINCE_DISTRICT_NAME
			FROM APP.REF_PROVINCE_DISTRICT
			WHERE ` + activeFilter(db, "REF_PROVINCE_DISTRICT", "") + `
			ORDER BY PROVINCE_DISTRICT_NAME
		`
		rows, err = db.Query(query)
	}

	if isMissingTable(err) {
		// PROD: APP.REF_PROVINCE_DISTRICT has no SELECT grant for IAMX (and holds no
		// rows there). Nothing to choose from is the honest answer — not a 500 that
		// breaks the whole filter panel.
		log.Printf("GetRefProvinceDistricts: table unavailable, returning empty: %v", err)
		return c.JSON(fiber.Map{"success": true, "data": []GeoOption{}})
	}
	if err != nil {
		log.Printf("GetRefProvinceDistricts error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	defer rows.Close()

	var result []GeoOption
	for rows.Next() {
		var o GeoOption
		var name sql.NullString
		if err := rows.Scan(&o.ID, &name); err != nil {
			log.Printf("GetRefProvinceDistricts scan error: %v", err)
			continue
		}
		if name.Valid {
			o.Name = name.String
		}
		result = append(result, o)
	}
	return c.JSON(fiber.Map{"success": true, "data": result})
}

// GetRefProvinces - GET /admin/ref/provinces?region_id=&province_district_id=
// Lists provinces, optionally filtered by region and/or province-district.
func GetRefProvinces(c *fiber.Ctx) error {
	db := core.GetDB()
	regionID := c.Query("region_id")
	provinceDistrictID := c.Query("province_district_id")

	query := `
		SELECT PROVINCE_ID, PROVINCE_NAME
		FROM APP.REF_PROVINCE
		WHERE ` + activeFilter(db, "REF_PROVINCE", "") + `
	`
	args := []interface{}{}
	paramIdx := 1

	if regionID != "" {
		query += ` AND REGION_ID = :` + itoa(paramIdx)
		args = append(args, regionID)
		paramIdx++
	}
	if provinceDistrictID != "" {
		query += ` AND REF_DISTRICT_ID = :` + itoa(paramIdx)
		args = append(args, provinceDistrictID)
		paramIdx++
	}
	query += ` ORDER BY PROVINCE_NAME`

	rows, err := db.Query(query, args...)
	if err != nil {
		log.Printf("GetRefProvinces error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	defer rows.Close()

	var result []GeoOption
	for rows.Next() {
		var o GeoOption
		var name sql.NullString
		if err := rows.Scan(&o.ID, &name); err != nil {
			log.Printf("GetRefProvinces scan error: %v", err)
			continue
		}
		if name.Valid {
			o.Name = name.String
		}
		result = append(result, o)
	}
	return c.JSON(fiber.Map{"success": true, "data": result})
}

// GetRefDistricts - GET /admin/ref/districts?province_id=
// Lists districts (อำเภอ) filtered by province.
func GetRefDistricts(c *fiber.Ctx) error {
	db := core.GetDB()
	provinceID := c.Query("province_id")

	if provinceID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "province_id is required"})
	}

	query := `
		SELECT DISTRICT_ID, DISTRICT_NAME
		FROM APP.REF_DISTRICT
		WHERE PROVINCE_ID = :1
		  AND ` + activeFilter(db, "REF_DISTRICT", "") + `
		ORDER BY DISTRICT_NAME
	`
	rows, err := db.Query(query, provinceID)
	if err != nil {
		log.Printf("GetRefDistricts error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	defer rows.Close()

	var result []GeoOption
	for rows.Next() {
		var o GeoOption
		var name sql.NullString
		if err := rows.Scan(&o.ID, &name); err != nil {
			log.Printf("GetRefDistricts scan error: %v", err)
			continue
		}
		if name.Valid {
			o.Name = name.String
		}
		result = append(result, o)
	}
	return c.JSON(fiber.Map{"success": true, "data": result})
}

// GetRefSubdistricts - GET /admin/ref/subdistricts?district_id=
// Lists subdistricts (ตำบล) filtered by district.
func GetRefSubdistricts(c *fiber.Ctx) error {
	db := core.GetDB()
	districtID := c.Query("district_id")

	if districtID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "district_id is required"})
	}

	query := `
		SELECT SUBDISTRICT_ID, SUBDISTRICT_NAME
		FROM APP.REF_SUBDISTRICT
		WHERE DISTRICT_ID = :1
		  AND ` + activeFilter(db, "REF_SUBDISTRICT", "") + `
		ORDER BY SUBDISTRICT_NAME
	`
	rows, err := db.Query(query, districtID)
	if err != nil {
		log.Printf("GetRefSubdistricts error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	defer rows.Close()

	var result []GeoOption
	for rows.Next() {
		var o GeoOption
		var name sql.NullString
		if err := rows.Scan(&o.ID, &name); err != nil {
			log.Printf("GetRefSubdistricts scan error: %v", err)
			continue
		}
		if name.Valid {
			o.Name = name.String
		}
		result = append(result, o)
	}
	return c.JSON(fiber.Map{"success": true, "data": result})
}
