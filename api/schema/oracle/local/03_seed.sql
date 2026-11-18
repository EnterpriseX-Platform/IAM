-- ============================================================
-- Local dev — RBAC seed data
-- Runs after iamx.sql and migrate_role_id_to_cuid.sql.
-- Minimal set: enough to exercise CRUD + permission resolution view.
-- All IDs are CUID strings (VARCHAR2(36)).
-- ============================================================

ALTER SESSION SET CURRENT_SCHEMA = IAMX;

-- 0. Generate CUIDs for seed records
VAR role_id    VARCHAR2(36);
VAR mapping_id VARCHAR2(36);
VAR resp_id    VARCHAR2(36);
VAR rrm_id     VARCHAR2(36);
VAR user_id    VARCHAR2(36);

-- 1. permission_type — fixed enum
INSERT INTO permission_type (permission_type, permission_type_group, description, is_active)
  VALUES ('VIEW',    'OBJECT',      N'ดูข้อมูล',    1);
INSERT INTO permission_type (permission_type, permission_type_group, description, is_active)
  VALUES ('CREATE',  'OBJECT',      N'สร้างข้อมูล', 1);
INSERT INTO permission_type (permission_type, permission_type_group, description, is_active)
  VALUES ('EDIT',    'OBJECT',      N'แก้ไขข้อมูล', 1);
INSERT INTO permission_type (permission_type, permission_type_group, description, is_active)
  VALUES ('DELETE',  'OBJECT',      N'ลบข้อมูล',    1);
INSERT INTO permission_type (permission_type, permission_type_group, description, is_active)
  VALUES ('APPROVE', 'OBJECT',      N'อนุมัติ',     1);
INSERT INTO permission_type (permission_type, permission_type_group, description, is_active)
  VALUES ('EXPORT',  'DATA_ACCESS', N'ส่งออกข้อมูล', 1);

-- 2. object_type
INSERT INTO object_type (code, name, description) VALUES ('MENU',   'Menu',   N'เมนูหลัก');
INSERT INTO object_type (code, name, description) VALUES ('TAB',    'Tab',    N'แท็บภายใน');
INSERT INTO object_type (code, name, description) VALUES ('BUTTON', 'Button', N'ปุ่มกระทำการ');

-- 3. domain -> application -> module -> object (1 sample chain)
INSERT INTO domain (code, name, description) VALUES ('PORTAL', 'Portal Domain', N'ระบบ Portal กลาง');
INSERT INTO application (domain_id, code, name, description, icon)
  VALUES (1, 'IAMX', 'IAMX Admin', N'หน้าจัดการ Identity', 'shield');
INSERT INTO module (application_id, code, name, description, icon)
  VALUES (1, 'USER_MGMT', 'User Management', N'จัดการผู้ใช้', 'users');

-- root menu + child
INSERT INTO object (module_id, object_type_id, parent_id, code, name, path, object_level, sort_order)
  VALUES (1, 1, NULL, 'USERS_ROOT', N'ผู้ใช้งานทั้งหมด', '/users',         1, 1);
INSERT INTO object (module_id, object_type_id, parent_id, code, name, path, object_level, sort_order)
  VALUES (1, 1, 1,    'USERS_ADMIN', N'ผู้ดูแลระบบ',     '/users/admin',  2, 1);
INSERT INTO object (module_id, object_type_id, parent_id, code, name, path, object_level, sort_order)
  VALUES (1, 3, 2,    'BTN_DELETE',  N'ลบผู้ใช้',         '/users/admin#delete', 3, 1);

-- 4. role + role-object mapping
BEGIN
  :role_id := LOWER(RAWTOHEX(SYS_GUID()));
  INSERT INTO role (id, code, name, description, default_role)
    VALUES (:role_id, 'ADMIN_ROLE', 'Administrator', N'เต็มสิทธิ์', 1);
  INSERT INTO role_object_mapping (role_id, object_id) VALUES (:role_id, 1)
    RETURNING id INTO :mapping_id;
  INSERT INTO role_object_permission (role_object_mapping_id, can_view, can_create, can_edit, can_delete, can_approve, can_export, can_print, permission_level)
    VALUES (:mapping_id, 1, 1, 1, 1, 1, 1, 1, 'FULL');
END;
/

-- 5. responsibility (linked to role)
BEGIN
  INSERT INTO responsibility (code, name, description) VALUES ('SUPER', 'Super User', N'ดูข้อมูลทุกหน่วยงาน')
    RETURNING id INTO :resp_id;
  INSERT INTO responsibility_role_mapping (responsibility_id, role_id) VALUES (:resp_id, :role_id)
    RETURNING id INTO :rrm_id;
  INSERT INTO responsibility_role_permission (responsibility_role_mapping_id, can_view, can_create, can_edit, can_delete, can_approve, can_export, can_print, permission_level)
    VALUES (:rrm_id, 1, 1, 1, 1, 1, 1, 1, 'FULL');
END;
/

-- responsibility data access — agency_id='stub-min-01' (กระทรวงตัวอย่าง) -> ครอบทั้งกระทรวง
INSERT INTO responsibility_data_access (responsibility_id, agency_id) VALUES (:resp_id, 'stub-min-01');
INSERT INTO responsibility_data_access_permission (responsibility_data_access_id, can_view, can_export, can_share, can_print)
  VALUES (1, 1, 1, 1, 1);

-- 6. user_info + binding to role/responsibility
BEGIN
  :user_id := LOWER(RAWTOHEX(SYS_GUID()));
  INSERT INTO user_info (user_id, user_name, email, "PASSWORD", first_name, last_name, status, personal_card_id)
    VALUES (:user_id, 'test_user_1', 'test1@example.com', NULL, 'Test', 'User', 'active', '1234567890123');
  INSERT INTO user_role_mapping (user_id, role_id) VALUES (:user_id, :role_id);
  INSERT INTO user_responsibility_mapping (user_id, responsibility_id) VALUES (:user_id, :resp_id);
END;
/

COMMIT;
