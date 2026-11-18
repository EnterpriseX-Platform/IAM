package handlers

import (
	"api/core"
	"encoding/json"
	"log"
	"strings"
)

func parsePermissionJSON(raw string) []string {
	if raw == "" || raw == "[]" {
		return []string{}
	}
	var perms []string
	if err := json.Unmarshal([]byte(raw), &perms); err != nil {
		return []string{}
	}
	return perms
}

func toPermissionJSON(perms []string) string {
	if len(perms) == 0 {
		return "[]"
	}
	b, err := json.Marshal(perms)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func getAgencyNames(agencyCodes map[string]bool) map[string]string {
	result := make(map[string]string)
	db := core.GetDB()
	if db == nil {
		log.Println("DB not available for agency name lookup")
		return result
	}
	codes := make([]string, 0, len(agencyCodes))
	for code := range agencyCodes {
		codes = append(codes, "'"+code+"'")
	}
	query := `SELECT AGC_CODE, AGC_NAME FROM APP.M_AGC WHERE AGC_CODE IN (` + strings.Join(codes, ",") + `)`
	rows, err := db.Query(query)
	if err != nil {
		log.Printf("Error querying agency names: %v", err)
		return result
	}
	defer rows.Close()
	for rows.Next() {
		var code, name string
		if err := rows.Scan(&code, &name); err == nil {
			result[code] = name
		}
	}
	return result
}
