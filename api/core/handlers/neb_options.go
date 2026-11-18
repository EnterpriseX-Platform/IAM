package handlers

import (
	"api/core"
	"api/core/usertypes"
	"database/sql"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Option struct for dropdown
type Option struct {
	Value int64  `json:"value"`
	Label string `json:"label"`
}

// GetDomainOptions ดึงรายการ Domains สำหรับ dropdown
func GetDomainOptions(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `SELECT d.id AS value, d.name AS label 
			  FROM domain d 
			  WHERE d.is_active = 1
			  ORDER BY d.name`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch domain options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := []Option{}
	for rows.Next() {
		var opt Option
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			continue
		}
		options = append(options, opt)
	}

	return c.JSON(fiber.Map{"data": options})
}

// GetApplicationOptions ดึงรายการ Applications สำหรับ dropdown (optional: filter by domain_id)
func GetApplicationOptions(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	domainID := c.Query("domain_id")

	var query string
	var rows *sql.Rows
	var err error

	if domainID != "" {
		query = `SELECT a.id AS value, a.name AS label 
				 FROM application a 
				 WHERE a.is_active = 1 AND a.domain_id = :1
				 ORDER BY a.name`
		rows, err = db.Query(query, domainID)
	} else {
		query = `SELECT a.id AS value, a.name AS label 
				 FROM application a 
				 WHERE a.is_active = 1
				 ORDER BY a.name`
		rows, err = db.Query(query)
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch application options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := []Option{}
	for rows.Next() {
		var opt Option
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			continue
		}
		options = append(options, opt)
	}

	return c.JSON(fiber.Map{"data": options})
}

// GetModuleOptions ดึงรายการ Modules สำหรับ dropdown (optional: filter by application_id)
func GetModuleOptions(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	applicationID := c.Query("application_id")

	var query string
	var rows *sql.Rows
	var err error

	if applicationID != "" {
		query = `SELECT m.id AS value, m.name AS label 
				 FROM module m 
				 WHERE m.is_active = 1 AND m.application_id = :1
				 ORDER BY m.name`
		rows, err = db.Query(query, applicationID)
	} else {
		query = `SELECT m.id AS value, m.name AS label 
				 FROM module m 
				 WHERE m.is_active = 1
				 ORDER BY m.name`
		rows, err = db.Query(query)
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch module options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := []Option{}
	for rows.Next() {
		var opt Option
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			continue
		}
		options = append(options, opt)
	}

	return c.JSON(fiber.Map{"data": options})
}

// GetObjectOptions ดึงรายการ Objects สำหรับ dropdown (optional: filter by module_id)
func GetObjectOptions(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	moduleID := c.Query("module_id")

	var query string
	var rows *sql.Rows
	var err error

	if moduleID != "" {
		query = `SELECT o.id AS value, o.name AS label 
				 FROM object o 
				 WHERE o.is_active = 1 AND o.module_id = :1
				 ORDER BY o.name`
		rows, err = db.Query(query, moduleID)
	} else {
		query = `SELECT o.id AS value, o.name AS label 
				 FROM object o 
				 WHERE o.is_active = 1
				 ORDER BY o.name`
		rows, err = db.Query(query)
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch object options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := []Option{}
	for rows.Next() {
		var opt Option
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			continue
		}
		options = append(options, opt)
	}

	return c.JSON(fiber.Map{"data": options})
}

// GetProcessOptions ดึงรายการ Processes สำหรับ dropdown (optional: filter by module_id)
func GetProcessOptionsExt(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	moduleID := c.Query("module_id")

	var query string
	var rows *sql.Rows
	var err error

	if moduleID != "" {
		query = `SELECT p.id AS value, p.name AS label 
				 FROM process p 
				 WHERE p.is_active = 1 AND p.module_id = :1
				 ORDER BY p.name`
		rows, err = db.Query(query, moduleID)
	} else {
		query = `SELECT p.id AS value, p.name AS label 
				 FROM process p 
				 WHERE p.is_active = 1
				 ORDER BY p.name`
		rows, err = db.Query(query)
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch process options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := []Option{}
	for rows.Next() {
		var opt Option
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			continue
		}
		options = append(options, opt)
	}

	return c.JSON(fiber.Map{"data": options})
}

// GetSubProcessOptions ดึงรายการ Sub Processes สำหรับ dropdown (optional: filter by process_id)
func GetSubProcessOptionsExt(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	processID := c.Query("process_id")

	var query string
	var rows *sql.Rows
	var err error

	if processID != "" {
		query = `SELECT sp.id AS value, sp.name AS label 
				 FROM sub_process sp 
				 WHERE sp.is_active = 1 AND sp.process_id = :1
				 ORDER BY sp.name`
		rows, err = db.Query(query, processID)
	} else {
		query = `SELECT sp.id AS value, sp.name AS label 
				 FROM sub_process sp 
				 WHERE sp.is_active = 1
				 ORDER BY sp.name`
		rows, err = db.Query(query)
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch sub process options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	options := []Option{}
	for rows.Next() {
		var opt Option
		if err := rows.Scan(&opt.Value, &opt.Label); err != nil {
			continue
		}
		options = append(options, opt)
	}

	return c.JSON(fiber.Map{"data": options})
}

// TreeNode struct for tree view
type TreeNode struct {
	ID       int64      `json:"id"`
	Label    string     `json:"label"`
	Code     string     `json:"code"`
	Path     string     `json:"path"`
	Level    int        `json:"level"`
	Children []TreeNode `json:"children"`
}

// GetObjectTree ดึงรายการ Objects ในรูปแบบ Tree (สำหรับ multi-select)
func GetObjectTree(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	moduleID := c.Query("module_id")

	var query string
	var rows *sql.Rows
	var err error

	if moduleID != "" {
		query = `SELECT o.id, o.code, o.name, o.path, o.object_level, o.parent_id
				 FROM object o 
				 WHERE o.module_id = :1
				 ORDER BY o.sort_order, o.name`
		rows, err = db.Query(query, moduleID)
	} else {
		query = `SELECT o.id, o.code, o.name, o.path, o.object_level, o.parent_id
				 FROM object o 
				 ORDER BY o.sort_order, o.name`
		rows, err = db.Query(query)
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch object tree",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	type ObjectItem struct {
		ID       int64
		Code     string
		Name     string
		Path     string
		Level    int
		ParentID sql.NullInt64
	}

	items := []ObjectItem{}
	for rows.Next() {
		var item ObjectItem
		if err := rows.Scan(&item.ID, &item.Code, &item.Name, &item.Path, &item.Level, &item.ParentID); err != nil {
			continue
		}
		items = append(items, item)
	}

	// Build tree
	nodeMap := make(map[int64]*TreeNode)
	var roots []TreeNode

	// First pass: create all nodes (use pointer to avoid copy issues)
	for i := range items {
		item := &items[i]
		label := item.Name
		if item.Code != "" {
			label = item.Code + ": " + item.Name
		}
		node := &TreeNode{
			ID:       item.ID,
			Label:    label,
			Code:     item.Code,
			Path:     item.Path,
			Level:    item.Level,
			Children: []TreeNode{},
		}
		nodeMap[item.ID] = node
	}

	// Second pass: build parent-child relationships
	for i := range items {
		item := &items[i]
		node := nodeMap[item.ID]
		if item.ParentID.Valid {
			if parent, ok := nodeMap[item.ParentID.Int64]; ok {
				parent.Children = append(parent.Children, *node)
			}
		} else {
			roots = append(roots, *node)
		}
	}

	return c.JSON(fiber.Map{"data": roots})
}

// HierarchyNode struct for objects with domain/app/module info
type HierarchyNode struct {
	ID              int64            `json:"id"`
	Label           string           `json:"label"`
	Code            string           `json:"code"`
	Path            string           `json:"path"`
	Level           int              `json:"level"`
	DomainName      string           `json:"domain_name"`
	DomainMenuType  string           `json:"domain_menu_type"`
	ApplicationName string           `json:"application_name"`
	ModuleName      string           `json:"module_name"`
	SortOrder       int              `json:"sort_order"`
	Children        []*HierarchyNode `json:"children"`
}

// GetObjectHierarchy ดึงรายการ Objects พร้อมข้อมูล Domain, Application, Module
// GET /directory/options/object-hierarchy
func GetObjectHierarchy(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `SELECT
		o.id, o.code, o.name, o.path, o.object_level, o.parent_id, o.sort_order,
		COALESCE(d.name, 'ไม่ระบุโดเมน') as domain_name,
		NVL(d.menu_type, ` + usertypes.SQLStaff() + `) as domain_menu_type,
		COALESCE(a.name, 'ไม่ระบุแอปพลิเคชัน') as application_name,
		COALESCE(m.name, 'ไม่ระบุโมดูล') as module_name
	FROM object o
	LEFT JOIN module m ON o.module_id = m.id
	LEFT JOIN application a ON m.application_id = a.id
	LEFT JOIN domain d ON a.domain_id = d.id
	WHERE o.is_active = 1
	ORDER BY d.code, a.name, m.name, o.sort_order, o.name`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch object hierarchy",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	type ObjectItem struct {
		ID              int64
		Code            string
		Name            string
		Path            string
		Level           int
		ParentID        sql.NullInt64
		SortOrder       int
		DomainName      string
		DomainMenuType  string
		ApplicationName string
		ModuleName      string
	}

	items := []ObjectItem{}
	for rows.Next() {
		var item ObjectItem
		if err := rows.Scan(&item.ID, &item.Code, &item.Name, &item.Path, &item.Level, &item.ParentID, &item.SortOrder,
			&item.DomainName, &item.DomainMenuType, &item.ApplicationName, &item.ModuleName); err != nil {
			continue
		}
		items = append(items, item)
	}

	// Build tree using recursive approach (same as GetObjectsByModule)
	nodeMap := make(map[int64]*HierarchyNode)
	parentMap := make(map[int64]*int64)

	for i := range items {
		item := &items[i]
		label := item.Name
		if item.Code != "" {
			label = item.Code + ": " + item.Name
		}
		node := &HierarchyNode{
			ID:              item.ID,
			Label:           label,
			Code:            item.Code,
			Path:            item.Path,
			Level:           item.Level,
			DomainName:      item.DomainName,
			DomainMenuType:  item.DomainMenuType,
			ApplicationName: item.ApplicationName,
			ModuleName:      item.ModuleName,
			SortOrder:       item.SortOrder,
			Children:        []*HierarchyNode{},
		}
		nodeMap[item.ID] = node

		if item.ParentID.Valid {
			parentID := item.ParentID.Int64
			parentMap[item.ID] = &parentID
		}
	}

	// Build tree recursively
	roots := buildHierarchyTree(nodeMap, parentMap)

	return c.JSON(fiber.Map{"data": roots})
}

// buildHierarchyTree builds the hierarchy tree from nodeMap
func buildHierarchyTree(nodeMap map[int64]*HierarchyNode, parentMap map[int64]*int64) []*HierarchyNode {
	var roots []*HierarchyNode

	for id, node := range nodeMap {
		if parentID, hasParent := parentMap[id]; !hasParent || parentID == nil {
			buildHierarchyChildrenRecursive(node, nodeMap, parentMap)
			roots = append(roots, node)
		}
	}

	return roots
}

// buildHierarchyChildrenRecursive recursively builds children for a node
func buildHierarchyChildrenRecursive(parent *HierarchyNode, nodeMap map[int64]*HierarchyNode, parentMap map[int64]*int64) {
	if parent == nil {
		return
	}

	parentID := parent.ID

	for id, node := range nodeMap {
		if pid, hasParent := parentMap[id]; hasParent && pid != nil && *pid == parentID {
			buildHierarchyChildrenRecursive(node, nodeMap, parentMap)
			parent.Children = append(parent.Children, node)
		}
	}
}

// ---- App Hierarchy (full Domain→App→Module→Object in one request) ----

type AppHierarchyObject struct {
	IsActive     *int                  `json:"is_active,omitempty"`
	ID           int64                 `json:"objectId"`
	ModuleID     int64                 `json:"module_id"`
	ObjectTypeID int32                 `json:"objectTypeId"`
	ParentID     *int64                `json:"parentObjectId"`
	Code         string                `json:"code"`
	Name         string                `json:"name"`
	Path         *string               `json:"path"`
	ObjectLevel  int32                 `json:"object_level"`
	SortOrder    int32                 `json:"sort_order"`
	TypeName     string                `json:"objectTypeName"`
	Children     []*AppHierarchyObject `json:"children"`
}

type AppHierarchyModule struct {
	IsActive      *int                  `json:"is_active,omitempty"`
	ID            int64                 `json:"id"`
	ApplicationID int64                 `json:"application_id"`
	Code          string                `json:"code"`
	Name          string                `json:"name"`
	Description   *string               `json:"description,omitempty"`
	SortOrder     int32                 `json:"sort_order"`
	Icon          *string               `json:"icon,omitempty"`
	Objects       []*AppHierarchyObject `json:"objects"`
}

type AppHierarchyApplication struct {
	IsActive    *int                  `json:"is_active,omitempty"`
	ID          int64                 `json:"id"`
	DomainID    int64                 `json:"domain_id"`
	Code        string                `json:"code"`
	Name        string                `json:"name"`
	Description *string               `json:"description,omitempty"`
	SortOrder   int32                 `json:"sort_order"`
	Icon        *string               `json:"icon,omitempty"`
	Modules     []*AppHierarchyModule `json:"modules"`
}

type AppHierarchyDomain struct {
	IsActive     *int                       `json:"is_active,omitempty"`
	ID           int64                      `json:"id"`
	Code         string                     `json:"code"`
	Name         string                     `json:"name"`
	Description  *string                    `json:"description,omitempty"`
	Applications []*AppHierarchyApplication `json:"applications"`
}

// GetAppHierarchy returns full Domain→App→Module→Object tree in 4 DB queries.
func getAppHierarchyUncached(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}
	inc := c.Query("include_inactive") == "1"
	act := func(alias string) string {
		if inc {
			return "1 = 1"
		}
		return alias + "is_active = 1"
	}
	flag := func(v int) *int {
		if !inc {
			return nil
		}
		return &v
	}

	// --- Domains ---
	dRows, err := db.Query(`SELECT id, code, name, description, is_active FROM IAMX.DOMAIN WHERE ` + act("") + ` ORDER BY id`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch domains", "message": err.Error()})
	}
	domainMap := map[int64]*AppHierarchyDomain{}
	var domainOrder []int64
	for dRows.Next() {
		var id int64
		var code, name string
		var desc sql.NullString
		var on int
		if err := dRows.Scan(&id, &code, &name, &desc, &on); err != nil {
			continue
		}
		d := &AppHierarchyDomain{ID: id, Code: code, Name: name, IsActive: flag(on), Applications: []*AppHierarchyApplication{}}
		if desc.Valid {
			d.Description = &desc.String
		}
		domainMap[id] = d
		domainOrder = append(domainOrder, id)
	}
	dRows.Close()

	// --- Applications ---
	aRows, err := db.Query(`SELECT id, domain_id, code, name, description, sort_order, icon, is_active FROM IAMX.APPLICATION WHERE ` + act("") + ` ORDER BY domain_id, sort_order, id`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch applications", "message": err.Error()})
	}
	appMap := map[int64]*AppHierarchyApplication{}
	for aRows.Next() {
		var id, domainID int64
		var code, name string
		var desc, icon sql.NullString
		var sortOrder int32
		var on int
		if err := aRows.Scan(&id, &domainID, &code, &name, &desc, &sortOrder, &icon, &on); err != nil {
			continue
		}
		a := &AppHierarchyApplication{ID: id, DomainID: domainID, Code: code, Name: name, SortOrder: sortOrder, IsActive: flag(on), Modules: []*AppHierarchyModule{}}
		if desc.Valid {
			a.Description = &desc.String
		}
		if icon.Valid {
			a.Icon = &icon.String
		}
		appMap[id] = a
		if d, ok := domainMap[domainID]; ok {
			d.Applications = append(d.Applications, a)
		}
	}
	aRows.Close()

	// --- Modules ---
	mRows, err := db.Query(`SELECT id, application_id, code, name, description, sort_order, icon, is_active FROM IAMX.MODULE WHERE ` + act("") + ` ORDER BY application_id, sort_order, id`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch modules", "message": err.Error()})
	}
	moduleMap := map[int64]*AppHierarchyModule{}
	for mRows.Next() {
		var id, appID int64
		var code, name string
		var desc, icon sql.NullString
		var sortOrder int32
		var on int
		if err := mRows.Scan(&id, &appID, &code, &name, &desc, &sortOrder, &icon, &on); err != nil {
			continue
		}
		m := &AppHierarchyModule{ID: id, ApplicationID: appID, Code: code, Name: name, SortOrder: sortOrder, IsActive: flag(on), Objects: []*AppHierarchyObject{}}
		if desc.Valid {
			m.Description = &desc.String
		}
		if icon.Valid {
			m.Icon = &icon.String
		}
		moduleMap[id] = m
		if a, ok := appMap[appID]; ok {
			a.Modules = append(a.Modules, m)
		}
	}
	mRows.Close()

	// --- Objects ---
	oRows, err := db.Query(`SELECT ao.id, ao.module_id, ao.object_type_id, ao.parent_id, ao.code, ao.name,
		ao.path, ao.object_level, ao.sort_order, NVL(ot.name, 'UNKNOWN') as type_name, ao.is_active
		FROM IAMX.OBJECT ao
		LEFT JOIN IAMX.OBJECT_TYPE ot ON ao.object_type_id = ot.id
		WHERE ` + act("ao.") + `
		ORDER BY ao.module_id, ao.object_level, ao.sort_order, ao.id`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch objects", "message": err.Error()})
	}

	type objEntry struct {
		obj       *AppHierarchyObject
		moduleID  int64
		hasParent bool
		parentID  int64
	}
	var objEntries []objEntry
	objMap := map[int64]*AppHierarchyObject{}

	for oRows.Next() {
		var id, moduleID int64
		var objTypeID int32
		var parentID sql.NullInt64
		var code, name, typeName string
		var path sql.NullString
		var objLevel, sortOrder int32
		var on int
		if err := oRows.Scan(&id, &moduleID, &objTypeID, &parentID, &code, &name, &path, &objLevel, &sortOrder, &typeName, &on); err != nil {
			continue
		}
		obj := &AppHierarchyObject{
			ID: id, ModuleID: moduleID, ObjectTypeID: objTypeID,
			Code: code, Name: name, ObjectLevel: objLevel, SortOrder: sortOrder,
			TypeName: typeName, IsActive: flag(on), Children: []*AppHierarchyObject{},
		}
		if path.Valid {
			obj.Path = &path.String
		}
		entry := objEntry{obj: obj, moduleID: moduleID}
		if parentID.Valid {
			pid := parentID.Int64
			obj.ParentID = &pid
			entry.hasParent = true
			entry.parentID = pid
		}
		objMap[id] = obj
		objEntries = append(objEntries, entry)
	}
	oRows.Close()

	for _, entry := range objEntries {
		if entry.hasParent {
			if parent, ok := objMap[entry.parentID]; ok {
				parent.Children = append(parent.Children, entry.obj)
			}
		} else {
			if m, ok := moduleMap[entry.moduleID]; ok {
				m.Objects = append(m.Objects, entry.obj)
			}
		}
	}

	result := make([]*AppHierarchyDomain, 0, len(domainOrder))
	for _, id := range domainOrder {
		if d, ok := domainMap[id]; ok {
			result = append(result, d)
		}
	}

	return c.JSON(fiber.Map{"data": result})
}

// 14/11/69 (ความเร็ว): โครงสร้างเมนูทั้งต้น (~1.2 วินาที) เก็บไว้ในหน่วยความจำ 1 นาที (หลาย pod จึงไม่ค้างนาน)
// ล้างทันทีเมื่อมีการแก้ข้อมูลใด ๆ (ClearHierarchyCache ถูกเรียกจาก middleware ล้างแคชหลังเขียน)
var (
	hierMu    sync.Mutex
	hierCache = map[string]hierEntry{}
)

type hierEntry struct {
	body []byte
	at   time.Time
}

func ClearHierarchyCache() {
	hierMu.Lock()
	hierCache = map[string]hierEntry{}
	hierMu.Unlock()
}

func GetAppHierarchy(c *fiber.Ctx) error {
	key := c.Query("include_inactive")
	hierMu.Lock()
	e, ok := hierCache[key]
	hierMu.Unlock()
	if ok && time.Since(e.at) < time.Minute {
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSONCharsetUTF8)
		return c.Send(e.body)
	}
	if err := getAppHierarchyUncached(c); err != nil {
		return err
	}
	if c.Response().StatusCode() == fiber.StatusOK {
		body := append([]byte(nil), c.Response().Body()...)
		hierMu.Lock()
		hierCache[key] = hierEntry{body: body, at: time.Now()}
		hierMu.Unlock()
	}
	return nil
}
