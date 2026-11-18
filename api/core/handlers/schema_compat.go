package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
)

// UAT and PROD share one code base but their APP reference tables drifted apart:
// PROD's APP.REF_REGION has no STATUS column and PROD's APP.MV_PROCESS_MAPPING has
// no DISPLAY_COMPONENT_NAME, so queries written against UAT failed on PROD with
// ORA-00904. These helpers let one query shape work on both by asking the data
// dictionary once per process which columns actually exist.

var columnCache sync.Map // "OWNER.TABLE.COLUMN" -> bool

// columnExists reports whether owner.table.column exists and is visible to the
// connecting user. Cached for the life of the process — reference-table schemas do
// not change at runtime. A dictionary error counts as "exists" so the original
// query runs and surfaces its own error rather than silently changing behaviour.
func columnExists(db *sql.DB, owner, table, column string) bool {
	key := strings.ToUpper(owner + "." + table + "." + column)
	if v, ok := columnCache.Load(key); ok {
		return v.(bool)
	}
	var n int
	err := db.QueryRow(`SELECT COUNT(*) FROM ALL_TAB_COLUMNS
		WHERE OWNER = :1 AND TABLE_NAME = :2 AND COLUMN_NAME = :3`,
		strings.ToUpper(owner), strings.ToUpper(table), strings.ToUpper(column)).Scan(&n)
	if err != nil {
		log.Printf("columnExists(%s) dictionary lookup failed: %v", key, err)
		return true
	}
	exists := n > 0
	columnCache.Store(key, exists)
	if !exists {
		log.Printf("schema compat: %s not present — query adapted", key)
	}
	return exists
}

// activeFilter returns the "active or unset" predicate for a reference table, or a
// tautology when the table has no STATUS column (every row is then active).
// alias is the table alias to qualify with ("" for none).
func activeFilter(db *sql.DB, table, alias string) string {
	if !columnExists(db, "APP", table, "STATUS") {
		return "1=1"
	}
	col := "STATUS"
	if alias != "" {
		col = alias + ".STATUS"
	}
	return fmt.Sprintf("(%s = 'active' OR %s IS NULL)", col, col)
}

// displayLabel matches "[alias.]DISPLAY_COMPONENT || ' ' || [alias.]DISPLAY_COMPONENT_NAME".
var displayLabel = regexp.MustCompile(`(\w+\.)?DISPLAY_COMPONENT\s*\|\|\s*' '\s*\|\|\s*(\w+\.)?DISPLAY_COMPONENT_NAME`)

// compatProcessMapping rewrites the step label for PROD's older APP.MV_PROCESS_MAPPING.
// There DISPLAY_COMPONENT_NAME does not exist and the DISPLAY_* columns are all NULL;
// the same information lives in PROCESS_CODE/SUBPROCESS_CODE ("3.1") and
// PROCESS_NAME/SUBPROCESS_NAME ("ขั้นภายใน" + "." + "เจ้าหน้าที่"), which is exactly how
// UAT's DISPLAY_COMPONENT / DISPLAY_COMPONENT_NAME are composed.
func compatProcessMapping(db *sql.DB, query string) string {
	if columnExists(db, "APP", "MV_PROCESS_MAPPING", "DISPLAY_COMPONENT_NAME") {
		return query
	}
	return displayLabel.ReplaceAllStringFunc(query, func(m string) string {
		a := displayLabel.FindStringSubmatch(m)[1] // alias incl. dot, or ""
		return "NVL(" + a + "DISPLAY_COMPONENT, " + a + "PROCESS_CODE || '.' || " + a + "SUBPROCESS_CODE)" +
			" || ' ' || " + a + "PROCESS_NAME || '.' || " + a + "SUBPROCESS_NAME"
	})
}

// isMissingTable reports ORA-00942 — the table does not exist or this user has no
// SELECT grant on it.
func isMissingTable(err error) bool {
	return err != nil && strings.Contains(err.Error(), "ORA-00942")
}
