-- ============================================================
-- RBAC + RESPONSIBILITY + USER PERMISSION SCHEMA for PostgreSQL
-- Version  : 3.0
-- Database : PostgreSQL 14+
-- Updated  : 2026-03-05
-- Changes  :
--   - PostgreSQL compatible syntax
--   - รวม can_view, can_create, ... เป็น permission (JSON array)
--   - เปลี่ยน object_id เป็น agency_path (ltree) ใน data_access tables
-- ============================================================

-- Enable ltree extension for hierarchical agency paths
CREATE EXTENSION IF NOT EXISTS ltree;

-- ============================================================
-- 0. UTILITY: DROP ORDER (run ถ้า recreate)
-- ============================================================

DROP TABLE IF EXISTS user_custom_data_access_permission CASCADE;
DROP TABLE IF EXISTS user_custom_data_access CASCADE;
DROP TABLE IF EXISTS user_custom_object_permission CASCADE;
DROP TABLE IF EXISTS user_custom_object_mapping CASCADE;
DROP TABLE IF EXISTS user_role_mapping CASCADE;
DROP TABLE IF EXISTS user_responsibility_mapping CASCADE;

DROP TABLE IF EXISTS responsibility_data_access_permission CASCADE;
DROP TABLE IF EXISTS responsibility_data_access CASCADE;
DROP TABLE IF EXISTS responsibility_role_permission CASCADE;
DROP TABLE IF EXISTS responsibility_role_mapping CASCADE;
DROP TABLE IF EXISTS responsibility CASCADE;

DROP TABLE IF EXISTS role_object_permission CASCADE;
DROP TABLE IF EXISTS role_object_mapping CASCADE;
DROP TABLE IF EXISTS role CASCADE;

DROP TABLE IF EXISTS process_mapper CASCADE;
DROP TABLE IF EXISTS sub_process CASCADE;
DROP TABLE IF EXISTS process CASCADE;
DROP TABLE IF EXISTS object CASCADE;
DROP TABLE IF EXISTS module CASCADE;
DROP TABLE IF EXISTS application CASCADE;
DROP TABLE IF EXISTS domain CASCADE;
DROP TABLE IF EXISTS object_type CASCADE;



-- ============================================================
-- 1. MASTER TABLES
-- ============================================================

CREATE TABLE "IAMX".object_type (
    id               SERIAL PRIMARY KEY,
    code             VARCHAR(50)    NOT NULL,
    name             VARCHAR(100)   NOT NULL,   -- MENU, TAB, BUTTON
    description      VARCHAR(255),
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_object_type_code UNIQUE (code),
    CONSTRAINT ck_object_type_active CHECK (is_active IN (0,1))
);

-- ──────────────────────────────────────────────────────────
CREATE TABLE "IAMX".domain (
    id               SERIAL PRIMARY KEY,
    code             VARCHAR(50)    NOT NULL,
    name             VARCHAR(200)   NOT NULL,
    description      VARCHAR(500),
    domain_url       VARCHAR(500),
    sort_order       SMALLINT       DEFAULT 0,
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_domain_code UNIQUE (code),
    CONSTRAINT ck_domain_active CHECK (is_active IN (0,1))
);

-- ──────────────────────────────────────────────────────────
CREATE TABLE "IAMX".application (
    id               SERIAL PRIMARY KEY,
    domain_id        INTEGER        NOT NULL,
    code             VARCHAR(50)    NOT NULL,
    name             VARCHAR(200)   NOT NULL,
    description      VARCHAR(500),
    sort_order       SMALLINT       DEFAULT 0,
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_application_domain FOREIGN KEY (domain_id) REFERENCES domain(id),
    CONSTRAINT uq_application_domain_code UNIQUE (domain_id, code),
    CONSTRAINT ck_application_active CHECK (is_active IN (0,1))
);

-- ──────────────────────────────────────────────────────────
CREATE TABLE "IAMX".module (
    id               SERIAL PRIMARY KEY,
    application_id   INTEGER        NOT NULL,
    code             VARCHAR(50)    NOT NULL,
    name             VARCHAR(200)   NOT NULL,
    description      VARCHAR(500),
    sort_order       SMALLINT       DEFAULT 0,
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_module_application FOREIGN KEY (application_id) REFERENCES application(id),
    CONSTRAINT uq_module_code        UNIQUE (code),
    CONSTRAINT ck_module_active      CHECK (is_active IN (0,1))
);

-- ──────────────────────────────────────────────────────────
-- OBJECT แบบ Tree (self-referencing)
CREATE TABLE "IAMX".object (
    id               SERIAL PRIMARY KEY,
    module_id        INTEGER        NOT NULL,
    object_type_id   INTEGER        NOT NULL,
    parent_id        INTEGER,                     -- self-join (NULL = root)
    code             VARCHAR(100)   NOT NULL,
    name             VARCHAR(200)   NOT NULL,
    path             VARCHAR(2000),              -- /domain/app/module/object
    object_level     SMALLINT       DEFAULT 1,
    sort_order       SMALLINT       DEFAULT 0,
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_object_module      FOREIGN KEY (module_id)      REFERENCES module(id),
    CONSTRAINT fk_object_type        FOREIGN KEY (object_type_id) REFERENCES object_type(id),
    CONSTRAINT fk_object_parent      FOREIGN KEY (parent_id)      REFERENCES object(id),
    CONSTRAINT uq_object_code        UNIQUE (code),
    CONSTRAINT ck_object_active      CHECK (is_active IN (0,1))
);

-- ──────────────────────────────────────────────────────────
CREATE TABLE "IAMX".process (
    id               SERIAL PRIMARY KEY,
    module_id        INTEGER        NOT NULL,
    object_id        INTEGER,
    code             VARCHAR(50)    NOT NULL,
    name             VARCHAR(200)   NOT NULL,
    description      VARCHAR(500),
    sort_order       SMALLINT       DEFAULT 0,
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_process_module     FOREIGN KEY (module_id) REFERENCES module(id),
    CONSTRAINT fk_process_object     FOREIGN KEY (object_id) REFERENCES object(id),
    CONSTRAINT uq_process_code       UNIQUE (code),
    CONSTRAINT ck_process_active     CHECK (is_active IN (0,1))
);

-- ──────────────────────────────────────────────────────────
CREATE TABLE "IAMX".sub_process (
    id               SERIAL PRIMARY KEY,
    process_id       INTEGER        NOT NULL,
    code             VARCHAR(50)    NOT NULL,
    name             VARCHAR(200)   NOT NULL,
    description      VARCHAR(500),
    sort_order       SMALLINT       DEFAULT 0,
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_subprocess_process FOREIGN KEY (process_id) REFERENCES process(id),
    CONSTRAINT uq_subprocess_code    UNIQUE (code),
    CONSTRAINT ck_subprocess_active  CHECK (is_active IN (0,1))
);

-- ──────────────────────────────────────────────────────────
-- process_mapper: เชื่อมโยง Process จาก Oracle กับ Module/Object
-- เก็บข้อมูล Process/Sub-process จาก Oracle MV_PROCESS_MAPPING
CREATE TABLE "IAMX".process_mapper (
    id                SERIAL PRIMARY KEY,
    module_id         INTEGER,
    object_id         INTEGER,
    fiscal_year       INTEGER        NOT NULL,  
    process_id        VARCHAR(100),              
    subprocess_id     VARCHAR(100),             
    process_name      VARCHAR(2000)   NOT NULL,
    subprocess_name   VARCHAR(2000)   NOT NULL,
    display_component VARCHAR(200)   NOT NULL,  
    process_code      VARCHAR(50)    NOT NULL,  
    subprocess_code   VARCHAR(50)    NOT NULL,  
    display_text      VARCHAR(500)   NOT NULL,  
    url               VARCHAR(1000)  NOT NULL,
    created_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_processmapper_module FOREIGN KEY (module_id) REFERENCES module(id) ON DELETE CASCADE,
    CONSTRAINT fk_processmapper_object FOREIGN KEY (object_id) REFERENCES object(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_process_mapper 
ON "IAMX".process_mapper (fiscal_year, process_code, subprocess_code, COALESCE(module_id, 0), COALESCE(object_id, 0));

CREATE INDEX idx_processmapper_module ON process_mapper(module_id);
CREATE INDEX idx_processmapper_object ON process_mapper(object_id);
CREATE INDEX idx_processmapper_fiscal_year ON process_mapper(fiscal_year);
CREATE INDEX idx_processmapper_codes ON process_mapper(process_code, subprocess_code);


-- ============================================================
-- 2. ROLE (RBAC)
-- ============================================================

CREATE TABLE "IAMX".role (
    id               SERIAL PRIMARY KEY,
    code             VARCHAR(50)    NOT NULL,
    name             VARCHAR(200)   NOT NULL,
    description      VARCHAR(500),
    effective_date   DATE           DEFAULT CURRENT_DATE NOT NULL,
    expire_date      DATE,
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    default_role     SMALLINT       DEFAULT 0   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_role_code          UNIQUE (code),
    CONSTRAINT ck_role_active        CHECK (is_active IN (0,1)),
    CONSTRAINT ck_role_expire        CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- ──────────────────────────────────────────────────────────
-- role_object_mapping: ผูก Role กับ Object hierarchy จริง
CREATE TABLE "IAMX".role_object_mapping (
    id               SERIAL PRIMARY KEY,
    role_id          INTEGER        NOT NULL,
    domain_id        INTEGER,
    application_id   INTEGER,
    module_id        INTEGER,
    object_id        INTEGER,
    process_id       INTEGER,
    sub_process_id   INTEGER,
    effective_date   DATE           DEFAULT CURRENT_DATE NOT NULL,
    expire_date      DATE,
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_rom_role           FOREIGN KEY (role_id)        REFERENCES role(id),
    CONSTRAINT fk_rom_domain         FOREIGN KEY (domain_id)      REFERENCES domain(id),
    CONSTRAINT fk_rom_application    FOREIGN KEY (application_id) REFERENCES application(id),
    CONSTRAINT fk_rom_module         FOREIGN KEY (module_id)      REFERENCES module(id),
    CONSTRAINT fk_rom_object         FOREIGN KEY (object_id)      REFERENCES object(id),
    CONSTRAINT fk_rom_process        FOREIGN KEY (process_id)     REFERENCES process(id),
    CONSTRAINT fk_rom_subprocess     FOREIGN KEY (sub_process_id) REFERENCES sub_process(id),
    CONSTRAINT ck_rom_active         CHECK (is_active IN (0,1)),
    CONSTRAINT ck_rom_ref_required   CHECK (
        domain_id IS NOT NULL OR application_id IS NOT NULL OR
        module_id IS NOT NULL OR object_id IS NOT NULL OR
        process_id IS NOT NULL OR sub_process_id IS NOT NULL
    )
);

-- ──────────────────────────────────────────────────────────
-- role_object_permission: Permission เป็น JSON array
CREATE TABLE "IAMX".role_object_permission (
    id                       SERIAL PRIMARY KEY,
    role_object_mapping_id   INTEGER     NOT NULL,
    permission               JSONB       NOT NULL,  -- JSON array: ["VIEW","CREATE","EDIT",...]
    permission_level         VARCHAR(20) DEFAULT 'CUSTOM',
    scope_filter             VARCHAR(500),
    created_by               INTEGER,
    updated_by               INTEGER,
    created_at               TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at               TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_rop_mapping    FOREIGN KEY (role_object_mapping_id) REFERENCES role_object_mapping(id),
    CONSTRAINT uq_rop_mapping    UNIQUE (role_object_mapping_id),
    CONSTRAINT ck_rop_level      CHECK (permission_level IN ('FULL','READ_ONLY','RESTRICTED','CUSTOM'))
);


-- ============================================================
-- 3. RESPONSIBILITY
-- ============================================================

CREATE TABLE "IAMX".responsibility (
    id               SERIAL PRIMARY KEY,
    code             VARCHAR(50)    NOT NULL,
    name             VARCHAR(200)   NOT NULL,
    description      VARCHAR(500),
    effective_date   DATE           DEFAULT CURRENT_DATE NOT NULL,
    expire_date      DATE,
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_responsibility_code  UNIQUE (code),
    CONSTRAINT ck_responsibility_active CHECK (is_active IN (0,1)),
    CONSTRAINT ck_responsibility_expire CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- ──────────────────────────────────────────────────────────
CREATE TABLE "IAMX".responsibility_role_mapping (
    id                  SERIAL PRIMARY KEY,
    responsibility_id   INTEGER     NOT NULL,
    role_id             INTEGER     NOT NULL,
    effective_date      DATE        DEFAULT CURRENT_DATE NOT NULL,
    expire_date         DATE,
    is_active           SMALLINT    DEFAULT 1   NOT NULL,
    created_by          INTEGER,
    updated_by          INTEGER,
    created_at          TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_rrm_responsibility FOREIGN KEY (responsibility_id) REFERENCES responsibility(id),
    CONSTRAINT fk_rrm_role          FOREIGN KEY (role_id)           REFERENCES role(id),
    CONSTRAINT uq_rrm               UNIQUE (responsibility_id, role_id),
    CONSTRAINT ck_rrm_active        CHECK (is_active IN (0,1)),
    CONSTRAINT ck_rrm_expire        CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- ──────────────────────────────────────────────────────────
-- responsibility_role_permission: Permission เป็น JSON array
CREATE TABLE "IAMX".responsibility_role_permission (
    id                          SERIAL PRIMARY KEY,
    responsibility_role_mapping_id INTEGER   NOT NULL,
    permission                  JSONB       NOT NULL,
    permission_level            VARCHAR(20) DEFAULT 'CUSTOM',
    scope_filter                VARCHAR(500),
    created_by                  INTEGER,
    updated_by                  INTEGER,
    created_at                  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at                  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_rrp_mapping   FOREIGN KEY (responsibility_role_mapping_id) REFERENCES responsibility_role_mapping(id),
    CONSTRAINT uq_rrp_mapping   UNIQUE (responsibility_role_mapping_id),
    CONSTRAINT ck_rrp_level     CHECK (permission_level IN ('FULL','READ_ONLY','RESTRICTED','CUSTOM'))
);

-- ──────────────────────────────────────────────────────────
-- สิทธิการให้ข้อมูล (Data Access ระดับ Responsibility)
-- ใช้ agency_path แบบ ltree
CREATE TABLE "IAMX".responsibility_data_access (
    id                  SERIAL PRIMARY KEY,
    responsibility_id   INTEGER        NOT NULL,
    agency_path         ltree          NOT NULL,     -- ltree format: '00001.00002.00003'
    scope_filter        VARCHAR(500),
    effective_date      DATE           DEFAULT CURRENT_DATE NOT NULL,
    expire_date         DATE,
    is_active           SMALLINT       DEFAULT 1   NOT NULL,
    created_by          INTEGER,
    updated_by          INTEGER,
    created_at          TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_rda_responsibility FOREIGN KEY (responsibility_id) REFERENCES responsibility(id),
    CONSTRAINT uq_rda                UNIQUE (responsibility_id, agency_path),
    CONSTRAINT ck_rda_active         CHECK (is_active IN (0,1))
);

-- ──────────────────────────────────────────────────────────
-- responsibility_data_access_permission: Permission เป็น JSON array
CREATE TABLE "IAMX".responsibility_data_access_permission (
    id                              SERIAL PRIMARY KEY,
    responsibility_data_access_id   INTEGER     NOT NULL,
    permission                      JSONB       NOT NULL,
    created_by                      INTEGER,
    updated_by                      INTEGER,
    created_at                      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at                      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_rdap_data_access  FOREIGN KEY (responsibility_data_access_id) REFERENCES responsibility_data_access(id),
    CONSTRAINT uq_rdap              UNIQUE (responsibility_data_access_id)
);


-- ============================================================
-- 4. USER
-- ============================================================

-- Note: user_info table now exists in PostgreSQL IAMX schema
-- All user_id references are INTEGER type matching user_info.user_id

-- ──────────────────────────────────────────────────────────
-- User → Responsibility (รับสิทธิจากกลุ่ม)
CREATE TABLE "IAMX".user_responsibility_mapping (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER     NOT NULL,  -- References "IAMX".user_info(user_id)
    responsibility_id   INTEGER     NOT NULL,
    effective_date      DATE        DEFAULT CURRENT_DATE NOT NULL,
    expire_date         DATE,
    is_active           SMALLINT    DEFAULT 1   NOT NULL,
    created_by          INTEGER,
    updated_by          INTEGER,
    created_at          TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_urm_responsibility FOREIGN KEY (responsibility_id) REFERENCES responsibility(id),
    CONSTRAINT uq_urm                UNIQUE (user_id, responsibility_id),
    CONSTRAINT ck_urm_active         CHECK (is_active IN (0,1)),
    CONSTRAINT ck_urm_expire         CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- ──────────────────────────────────────────────────────────
-- User → Role (รับ Role โดยตรง)
CREATE TABLE "IAMX".user_role_mapping (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER     NOT NULL,  -- References "IAMX".user_info(user_id)
    role_id          INTEGER     NOT NULL,
    effective_date   DATE        DEFAULT CURRENT_DATE NOT NULL,
    expire_date      DATE,
    is_active        SMALLINT    DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_url_role     FOREIGN KEY (role_id) REFERENCES role(id),
    CONSTRAINT uq_url          UNIQUE (user_id, role_id),
    CONSTRAINT ck_url_active   CHECK (is_active IN (0,1)),
    CONSTRAINT ck_url_expire   CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- ──────────────────────────────────────────────────────────
-- User Custom Override (ผูก User กับ Object โดยตรง ชนะทุกอย่าง)
CREATE TABLE "IAMX".user_custom_object_mapping (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER     NOT NULL,  -- References "IAMX".user_info(user_id)
    domain_id        INTEGER,
    application_id   INTEGER,
    module_id        INTEGER,
    object_id        INTEGER,
    process_id       INTEGER,
    sub_process_id   INTEGER,
    override_reason  VARCHAR(500),
    effective_date   DATE        DEFAULT CURRENT_DATE NOT NULL,
    expire_date      DATE,
    is_active        SMALLINT    DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_ucom_domain        FOREIGN KEY (domain_id)      REFERENCES domain(id),
    CONSTRAINT fk_ucom_application   FOREIGN KEY (application_id) REFERENCES application(id),
    CONSTRAINT fk_ucom_module        FOREIGN KEY (module_id)      REFERENCES module(id),
    CONSTRAINT fk_ucom_object        FOREIGN KEY (object_id)      REFERENCES object(id),
    CONSTRAINT fk_ucom_process       FOREIGN KEY (process_id)     REFERENCES process(id),
    CONSTRAINT fk_ucom_subprocess    FOREIGN KEY (sub_process_id) REFERENCES sub_process(id),
    CONSTRAINT ck_ucom_active        CHECK (is_active IN (0,1)),
    CONSTRAINT ck_ucom_ref_required  CHECK (
        domain_id IS NOT NULL OR application_id IS NOT NULL OR
        module_id IS NOT NULL OR object_id IS NOT NULL OR
        process_id IS NOT NULL OR sub_process_id IS NOT NULL
    )
);

-- ──────────────────────────────────────────────────────────
-- user_custom_object_permission: Permission เป็น JSON array
CREATE TABLE "IAMX".user_custom_object_permission (
    id                           SERIAL PRIMARY KEY,
    user_custom_object_mapping_id INTEGER   NOT NULL,
    permission                   JSONB       NOT NULL,
    permission_level             VARCHAR(20) DEFAULT 'CUSTOM',
    scope_filter                 VARCHAR(500),
    created_by                   INTEGER,
    updated_by                   INTEGER,
    created_at                   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at                   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_ucop_mapping   FOREIGN KEY (user_custom_object_mapping_id) REFERENCES user_custom_object_mapping(id),
    CONSTRAINT uq_ucop_mapping   UNIQUE (user_custom_object_mapping_id),
    CONSTRAINT ck_ucop_level     CHECK (permission_level IN ('FULL','READ_ONLY','RESTRICTED','CUSTOM'))
);

-- ──────────────────────────────────────────────────────────
-- User Custom Data Access (สิทธิการเห็นข้อมูล ระดับ User)
-- ใช้ agency_path แบบ ltree
CREATE TABLE "IAMX".user_custom_data_access (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER        NOT NULL,  -- References "IAMX".user_info(user_id)
    agency_path      ltree          NOT NULL,
    scope_filter     VARCHAR(500),
    override_reason  VARCHAR(500),
    effective_date   DATE           DEFAULT CURRENT_DATE NOT NULL,
    expire_date      DATE,
    is_active        SMALLINT       DEFAULT 1   NOT NULL,
    created_by       INTEGER,
    updated_by       INTEGER,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_ucda           UNIQUE (user_id, agency_path),
    CONSTRAINT ck_ucda_active    CHECK (is_active IN (0,1)),
    CONSTRAINT ck_ucda_expire    CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- ──────────────────────────────────────────────────────────
-- user_custom_data_access_permission: Permission เป็น JSON array
CREATE TABLE "IAMX".user_custom_data_access_permission (
    id                          SERIAL PRIMARY KEY,
    user_custom_data_access_id  INTEGER     NOT NULL,
    permission                  JSONB       NOT NULL,
    created_by                  INTEGER,
    updated_by                  INTEGER,
    created_at                  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at                  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_ucdap_access  FOREIGN KEY (user_custom_data_access_id) REFERENCES user_custom_data_access(id),
    CONSTRAINT uq_ucdap         UNIQUE (user_custom_data_access_id)
);


-- ============================================================
-- 4.5 PERMISSION TYPE MASTER
-- ============================================================

CREATE TABLE "IAMX".permission_type (
    id               BIGSERIAL PRIMARY KEY,
    permission_type  VARCHAR(200)   NOT NULL,  -- e.g., 'VIEW', 'CREATE', 'EDIT', 'DELETE', 'READ', 'WRITE'
    permission_type_group VARCHAR(200) NULL,   -- e.g., 'OBJECT', 'DATA_ACCESS', 'REPORT', 'WORKFLOW'
    description      VARCHAR(500),
    is_active        SMALLINT       DEFAULT 1 NOT NULL,
    created_by       BIGINT,
    updated_by       BIGINT,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_permission_type_active CHECK (is_active IN (0,1))
);

-- Permission values for different groups
INSERT INTO "IAMX".permission_type (permission_type, permission_type_group, description, is_active) VALUES
-- Object permissions (for Role-Object, User-Custom-Object)
('VIEW',    'OBJECT', 'ดูข้อมูล', 1),
('CREATE',  'OBJECT', 'สร้างข้อมูล', 1),
('EDIT',    'OBJECT', 'แก้ไขข้อมูล', 1),
('DELETE',  'OBJECT', 'ลบข้อมูล', 1),
('APPROVE', 'OBJECT', 'อนุมัติ', 1),
('EXPORT',  'OBJECT', 'ส่งออก', 1),
('PRINT',   'OBJECT', 'พิมพ์', 1),
-- Data Access permissions (for Responsibility-Data-Access, User-Data-Access)
('READ',          'DATA_ACCESS', 'อ่านอย่างเดียว', 1),
('WRITE',         'DATA_ACCESS', 'อ่าน/เขียน', 1),
('RESTRICTED',    'DATA_ACCESS', 'เข้าถึงจำกัด', 1),
('ADMIN_ACCESS',  'DATA_ACCESS', 'ผู้ดูแลระบบ', 1),
-- Additional data access levels
('OWN_ONLY',      'DATA_ACCESS', 'เห็นเฉพาะของตัวเอง', 1),
('DEPARTMENT',    'DATA_ACCESS', 'เห็นระดับแผนก', 1),
('MINISTRY',      'DATA_ACCESS', 'เห็นระดับกระทรวง', 1),
('ALL',           'DATA_ACCESS', 'เห็นทั้งหมด', 1);

-- ============================================================
-- 5. INDEXES
-- ============================================================

-- object
CREATE INDEX idx_object_module      ON object(module_id);
CREATE INDEX idx_object_parent      ON object(parent_id);
CREATE INDEX idx_object_path        ON object(path);
CREATE INDEX idx_object_type        ON object(object_type_id);

-- role_object_mapping
CREATE INDEX idx_rom_role           ON role_object_mapping(role_id);
CREATE INDEX idx_rom_object         ON role_object_mapping(object_id);
CREATE INDEX idx_rom_module         ON role_object_mapping(module_id);
CREATE INDEX idx_rom_active         ON role_object_mapping(is_active);

-- responsibility
CREATE INDEX idx_rrm_responsibility ON responsibility_role_mapping(responsibility_id);
CREATE INDEX idx_rrm_role           ON responsibility_role_mapping(role_id);

-- data_access with ltree agency_path
CREATE INDEX idx_rda_responsibility ON responsibility_data_access(responsibility_id);
CREATE INDEX idx_rda_agency_path    ON responsibility_data_access USING GIST (agency_path);

-- user mappings
CREATE INDEX idx_urm_respon         ON user_responsibility_mapping(responsibility_id);
CREATE INDEX idx_urm_active         ON user_responsibility_mapping(is_active);
CREATE INDEX idx_url_role           ON user_role_mapping(role_id);
CREATE INDEX idx_ucom_object        ON user_custom_object_mapping(object_id);

-- data_access user indexes
CREATE INDEX idx_ucda_agency_path   ON user_custom_data_access USING GIST (agency_path);

ALTER TABLE "IAMX"."application" ADD icon text NULL;
ALTER TABLE "IAMX"."module" ADD icon text NULL;
ALTER TABLE "IAMX"."object" ADD icon text NULL;

-- ============================================================
-- 6. EFFECTIVE PERMISSION VIEW
--    Resolve Priority: Custom > Responsibility > Role
--    Permission เป็น JSON array format
--    Supports hierarchy: domain -> application -> module -> object
-- ============================================================-- ========================================
-- v_user_effective_permission: รวมสิทธิ์จากทุกแหล่ง พร้อมลำดับความสำคัญ
-- ========================================
CREATE OR REPLACE VIEW "IAMX".v_user_effective_permission AS

-- ========================================
-- PRIORITY 3: ROLE (RBAC) - Object Level
-- ========================================
SELECT
    ui.user_id,
    obj.id          AS object_id,
    obj.code        AS object_code,
    obj.icon        AS object_icon,
    mod.id          AS module_id,
    mod.code        AS module_code,
    mod.icon        AS module_icon,
    mod.sort_order  AS module_sort_order,
    app.id          AS application_id,
    app.code        AS application_code,
    app.icon        AS application_icon,
    dom.id          AS domain_id,
    dom.code        AS domain_code,
    NULL::ltree     AS agency_path,
    rop.permission,
    rop.permission_level,
    rop.scope_filter,
    'ROLE'          AS permission_source,
    3               AS priority
FROM "IAMX".user_info ui
JOIN user_role_mapping       url  ON url.user_id::int = ui.user_id AND url.is_active = 1
JOIN role                    r    ON r.id = url.role_id AND r.is_active = 1
JOIN role_object_mapping     rom  ON rom.role_id = r.id AND rom.is_active = 1
JOIN role_object_permission  rop  ON rop.role_object_mapping_id = rom.id
JOIN object                  obj  ON obj.id = COALESCE(rom.object_id, obj.id)
JOIN module                  mod  ON mod.id = obj.module_id
JOIN application             app  ON app.id = mod.application_id
JOIN domain                  dom  ON dom.id = app.domain_id
WHERE CURRENT_DATE BETWEEN url.effective_date AND COALESCE(url.expire_date, CURRENT_DATE)
  AND (
      -- Match specific object
      rom.object_id = obj.id
      -- OR match module
      OR (rom.module_id IS NOT NULL AND rom.module_id = mod.id)
      -- OR match application
      OR (rom.application_id IS NOT NULL AND rom.application_id = app.id)
      -- OR match domain
      OR (rom.domain_id IS NOT NULL AND rom.domain_id = dom.id)
  )

UNION ALL

-- ========================================
-- PRIORITY 2: RESPONSIBILITY - Object Level
-- ========================================
SELECT
    ui.user_id,
    obj.id          AS object_id,
    obj.code        AS object_code,
    obj.icon        AS object_icon,
    mod.id          AS module_id,
    mod.code        AS module_code,
    mod.icon        AS module_icon,
    mod.sort_order  AS module_sort_order,
    app.id          AS application_id,
    app.code        AS application_code,
    app.icon        AS application_icon,
    dom.id          AS domain_id,
    dom.code        AS domain_code,
    NULL::ltree     AS agency_path,
    rrp.permission,
    rrp.permission_level,
    rrp.scope_filter,
    'RESPONSIBILITY' AS permission_source,
    2               AS priority
FROM "IAMX".user_info ui
JOIN user_responsibility_mapping    urm  ON urm.user_id::int = ui.user_id AND urm.is_active = 1
JOIN responsibility                 resp ON resp.id = urm.responsibility_id AND resp.is_active = 1
JOIN responsibility_role_mapping    rrm  ON rrm.responsibility_id = resp.id AND rrm.is_active = 1
JOIN responsibility_role_permission rrp  ON rrp.responsibility_role_mapping_id = rrm.id
JOIN role                           r    ON r.id = rrm.role_id
JOIN role_object_mapping            rom  ON rom.role_id = r.id AND rom.is_active = 1
JOIN object                         obj  ON obj.id = COALESCE(rom.object_id, obj.id)
JOIN module                         mod  ON mod.id = obj.module_id
JOIN application                    app  ON app.id = mod.application_id
JOIN domain                         dom  ON dom.id = app.domain_id
WHERE CURRENT_DATE BETWEEN urm.effective_date AND COALESCE(urm.expire_date, CURRENT_DATE)
  AND (
      rom.object_id = obj.id
      OR (rom.module_id IS NOT NULL AND rom.module_id = mod.id)
      OR (rom.application_id IS NOT NULL AND rom.application_id = app.id)
      OR (rom.domain_id IS NOT NULL AND rom.domain_id = dom.id)
  )

UNION ALL

-- ========================================
-- PRIORITY 1: CUSTOM OVERRIDE - Object Level
-- ========================================
SELECT
    ui.user_id,
    obj.id          AS object_id,
    obj.code        AS object_code,
    obj.icon        AS object_icon,
    mod.id          AS module_id,
    mod.code        AS module_code,
    mod.icon        AS module_icon,
    mod.sort_order  AS module_sort_order,
    app.id          AS application_id,
    app.code        AS application_code,
    app.icon        AS application_icon,
    dom.id          AS domain_id,
    dom.code        AS domain_code,
    NULL::ltree     AS agency_path,
    ucop.permission,
    ucop.permission_level,
    ucop.scope_filter,
    'CUSTOM'        AS permission_source,
    1               AS priority
FROM "IAMX".user_info ui
JOIN user_custom_object_mapping     ucom ON ucom.user_id::int = ui.user_id AND ucom.is_active = 1
JOIN user_custom_object_permission  ucop ON ucop.user_custom_object_mapping_id = ucom.id
JOIN object                         obj  ON obj.id = COALESCE(ucom.object_id, obj.id)
JOIN module                         mod  ON mod.id = obj.module_id
JOIN application                    app  ON app.id = mod.application_id
JOIN domain                         dom  ON dom.id = app.domain_id
WHERE CURRENT_DATE BETWEEN ucom.effective_date AND COALESCE(ucom.expire_date, CURRENT_DATE)
  AND (
      ucom.object_id = obj.id
      OR (ucom.module_id IS NOT NULL AND ucom.module_id = mod.id)
      OR (ucom.application_id IS NOT NULL AND ucom.application_id = app.id)
      OR (ucom.domain_id IS NOT NULL AND ucom.domain_id = dom.id)
    );


CREATE INDEX idx_user_role_mapping_user
ON "IAMX".user_role_mapping(user_id);

CREATE INDEX idx_user_responsibility_mapping_user
ON "IAMX".user_responsibility_mapping(user_id);

CREATE INDEX idx_user_custom_object_mapping_user
ON "IAMX".user_custom_object_mapping(user_id);


-- ============================================================
-- 7. EFFECTIVE DATA ACCESS VIEW
--    Resolve Priority: Custom > Responsibility
--    สำหรับ Data Access ที่มี agency_path
-- ============================================================
CREATE OR REPLACE VIEW "IAMX".v_user_effective_data_access AS
-- Priority 2: จาก Responsibility (Data Access)
SELECT
    ui.user_id               AS user_id,
    rda.agency_path          AS agency_path,
    rdap.permission          AS permission,
    rda.scope_filter,
    'RESPONSIBILITY'         AS permission_source,
    2                        AS priority
FROM "IAMX".user_info ui
JOIN user_responsibility_mapping    urm  ON urm.user_id::int = ui.user_id AND urm.is_active = 1
JOIN responsibility                  resp ON resp.id = urm.responsibility_id AND resp.is_active = 1
JOIN responsibility_data_access      rda  ON rda.responsibility_id = resp.id AND rda.is_active = 1
JOIN responsibility_data_access_permission rdap ON rdap.responsibility_data_access_id = rda.id
WHERE CURRENT_DATE BETWEEN urm.effective_date AND COALESCE(urm.expire_date, CURRENT_DATE)

UNION ALL

-- Priority 1: Custom Override (ชนะสุด) - Data Access
SELECT
    ui.user_id               AS user_id,
    ucda.agency_path         AS agency_path,
    ucdap.permission         AS permission,
    ucda.scope_filter,
    'CUSTOM'                 AS permission_source,
    1                        AS priority
FROM "IAMX".user_info ui
JOIN user_custom_data_access         ucda ON ucda.user_id::int = ui.user_id AND ucda.is_active = 1
JOIN user_custom_data_access_permission ucdap ON ucdap.user_custom_data_access_id = ucda.id
WHERE CURRENT_DATE BETWEEN ucda.effective_date AND COALESCE(ucda.expire_date, CURRENT_DATE);


-- ============================================================
-- 8. HELPER FUNCTIONS FOR PERMISSION CHECKING
-- ============================================================

-- ตรวจสอบว่ามี permission ใน JSON array หรือไม่
CREATE OR REPLACE FUNCTION has_permission(permission_json JSONB, check_perm TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN permission_json @> to_jsonb(check_perm);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ดึง permission ที่มี priority สูงสุดสำหรับ user + object (by user_id)
CREATE OR REPLACE FUNCTION get_effective_permission(p_user_id INTEGER, p_object_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_permission JSONB;
BEGIN
    SELECT permission INTO v_permission
    FROM v_user_effective_permission
    WHERE user_id = p_user_id
      AND object_id = p_object_id
    ORDER BY priority ASC
    LIMIT 1;
    
    RETURN COALESCE(v_permission, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE;

-- ดึง effective data access สำหรับ user + agency_path (by user_id)
CREATE OR REPLACE FUNCTION get_effective_data_access(p_user_id INTEGER, p_agency_path ltree)
RETURNS JSONB AS $$
DECLARE
    v_permission JSONB;
BEGIN
    SELECT permission INTO v_permission
    FROM v_user_effective_data_access
    WHERE user_id = p_user_id
      AND agency_path = p_agency_path
    ORDER BY priority ASC
    LIMIT 1;
    
    RETURN COALESCE(v_permission, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================
-- MENU ACCESS LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS "IAMX".menu_access_logs (
    menu_access_logs_id SERIAL PRIMARY KEY,
    user_id         VARCHAR(50) NOT NULL,
    obj_id          VARCHAR(100) NOT NULL,
    obj_name        VARCHAR(255),
    module_code     VARCHAR(50),
    url             TEXT,
    ip_address      VARCHAR(45),
    created_date    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_access_logs_user_id ON "IAMX".menu_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_menu_access_logs_created_date ON "IAMX".menu_access_logs(created_date);

-- ============================================================
-- 9. RESPONSIBILITY DETAIL VIEW
--    Full detail: object permissions (via role) + data access
--    permission_type = 'OBJECT'      → role/object columns populated, priority NULL
--    permission_type = 'DATA_ACCESS' → agency_path/data_permission populated
--      priority 3 = via user_role_mapping → role → responsibility → data_access (lowest)
--      priority 2 = via user_responsibility_mapping → responsibility → data_access (direct)
--      priority 1 = via user_custom_data_access (wins)
-- ============================================================
-- "IAMX".v_user_responsibility_detail source

CREATE OR REPLACE VIEW "IAMX".v_user_responsibility_detail
AS SELECT ui.user_id,
    resp.code AS responsibility_code,
    resp.name AS responsibility_name,
    r.code AS role_code,
    r.name AS role_name,
    dom.code AS domain_code,
    app.code AS application_code,
    mod.code AS module_code,
    obj.code AS object_code,
    obj.name AS object_name,
    rrp.permission AS object_permission,
    rrp.permission_level,
    rrp.scope_filter,
    NULL::ltree AS agency_path,
    NULL::jsonb AS data_permission,
    'OBJECT'::text AS permission_type,
    NULL::integer AS priority,
    urm.effective_date,
    urm.expire_date
   FROM "IAMX".user_info ui
     JOIN user_responsibility_mapping urm ON urm.user_id::integer = ui.user_id AND urm.is_active = 1
     JOIN responsibility resp ON resp.id = urm.responsibility_id AND resp.is_active = 1
     JOIN responsibility_role_mapping rrm ON rrm.responsibility_id = resp.id AND rrm.is_active = 1
     JOIN responsibility_role_permission rrp ON rrp.responsibility_role_mapping_id = rrm.id
     JOIN role r ON r.id = rrm.role_id AND r.is_active = 1
     JOIN role_object_mapping rom ON rom.role_id = r.id AND rom.is_active = 1
     LEFT JOIN object obj ON obj.id = rom.object_id
     LEFT JOIN module mod ON mod.id = COALESCE(rom.module_id, obj.module_id)
     LEFT JOIN application app ON app.id = COALESCE(rom.application_id, mod.application_id)
     LEFT JOIN domain dom ON dom.id = COALESCE(rom.domain_id, app.domain_id)
  WHERE CURRENT_DATE >= urm.effective_date AND CURRENT_DATE <= COALESCE(urm.expire_date, CURRENT_DATE)
UNION ALL
 SELECT ui.user_id,
    resp.code AS responsibility_code,
    resp.name AS responsibility_name,
    NULL::character varying AS role_code,
    NULL::character varying AS role_name,
    NULL::character varying AS domain_code,
    NULL::character varying AS application_code,
    NULL::character varying AS module_code,
    NULL::character varying AS object_code,
    NULL::character varying AS object_name,
    NULL::jsonb AS object_permission,
    NULL::character varying AS permission_level,
    rda.scope_filter,
    rda.agency_path,
    rdap.permission AS data_permission,
    'DATA_ACCESS'::text AS permission_type,
    2 AS priority,
    urm.effective_date,
    urm.expire_date
   FROM "IAMX".user_info ui
     JOIN user_responsibility_mapping urm ON urm.user_id::integer = ui.user_id AND urm.is_active = 1
     JOIN responsibility resp ON resp.id = urm.responsibility_id AND resp.is_active = 1
     JOIN responsibility_data_access rda ON rda.responsibility_id = resp.id AND rda.is_active = 1
     JOIN responsibility_data_access_permission rdap ON rdap.responsibility_data_access_id = rda.id
  WHERE CURRENT_DATE >= urm.effective_date AND CURRENT_DATE <= COALESCE(urm.expire_date, CURRENT_DATE)
UNION ALL
 SELECT ui.user_id,
    resp.code AS responsibility_code,
    resp.name AS responsibility_name,
    r.code AS role_code,
    r.name AS role_name,
    NULL::character varying AS domain_code,
    NULL::character varying AS application_code,
    NULL::character varying AS module_code,
    NULL::character varying AS object_code,
    NULL::character varying AS object_name,
    NULL::jsonb AS object_permission,
    NULL::character varying AS permission_level,
    rda.scope_filter,
    rda.agency_path,
    rdap.permission AS data_permission,
    'DATA_ACCESS'::text AS permission_type,
    3 AS priority,
    url.effective_date,
    url.expire_date
   FROM "IAMX".user_info ui
     JOIN user_role_mapping url ON url.user_id::integer = ui.user_id AND url.is_active = 1
     JOIN role r ON r.id = url.role_id AND r.is_active = 1
     JOIN responsibility_role_mapping rrm ON rrm.role_id = r.id AND rrm.is_active = 1
     JOIN responsibility resp ON resp.id = rrm.responsibility_id AND resp.is_active = 1
     JOIN responsibility_data_access rda ON rda.responsibility_id = resp.id AND rda.is_active = 1
     JOIN responsibility_data_access_permission rdap ON rdap.responsibility_data_access_id = rda.id
  WHERE CURRENT_DATE >= url.effective_date AND CURRENT_DATE <= COALESCE(url.expire_date, CURRENT_DATE)
UNION ALL
 SELECT ui.user_id,
    NULL::character varying AS responsibility_code,
    NULL::character varying AS responsibility_name,
    NULL::character varying AS role_code,
    NULL::character varying AS role_name,
    NULL::character varying AS domain_code,
    NULL::character varying AS application_code,
    NULL::character varying AS module_code,
    NULL::character varying AS object_code,
    NULL::character varying AS object_name,
    NULL::jsonb AS object_permission,
    NULL::character varying AS permission_level,
    ucda.scope_filter,
    ucda.agency_path,
    ucdap.permission AS data_permission,
    'DATA_ACCESS'::text AS permission_type,
    1 AS priority,
    ucda.effective_date,
    ucda.expire_date
   FROM "IAMX".user_info ui
     JOIN user_custom_data_access ucda ON ucda.user_id::integer = ui.user_id AND ucda.is_active = 1
     JOIN user_custom_data_access_permission ucdap ON ucdap.user_custom_data_access_id = ucda.id
  WHERE CURRENT_DATE >= ucda.effective_date AND CURRENT_DATE <= COALESCE(ucda.expire_date, CURRENT_DATE);

  
CREATE INDEX idx_v_urd_user_id ON "IAMX".user_responsibility_mapping(user_id);

-- ============================================================
-- 10. ROLE DETAIL VIEW
--     user → user_role_mapping → role → role_object_mapping → object
--     Direct role assignment only (no responsibility path)
-- ============================================================
CREATE OR REPLACE VIEW "IAMX".v_user_role_detail AS
SELECT
    ui.user_id,
    r.id                    AS role_id,
    r.code                  AS role_code,
    r.name                  AS role_name,
    r.description           AS role_description,
    url.effective_date,
    url.expire_date
FROM "IAMX".user_info ui
JOIN "IAMX".user_role_mapping  url  ON url.user_id::int = ui.user_id AND url.is_active = 1
JOIN "IAMX".role               r    ON r.id = url.role_id AND r.is_active = 1
WHERE CURRENT_DATE BETWEEN url.effective_date AND COALESCE(url.expire_date, CURRENT_DATE);

CREATE INDEX idx_v_urd_role_user_id ON "IAMX".user_role_mapping(user_id);

-- ============================================================
-- END OF SCRIPT
-- ============================================================
