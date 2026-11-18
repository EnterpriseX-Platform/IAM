-- ============================================================
-- RBAC + RESPONSIBILITY + USER PERMISSION SCHEMA
-- Version  : 2.0
-- Database : Oracle 18c+  (identifier max 128 chars)
-- Updated  : 2026-02-19
-- Changes  :
--   - เพิ่ม created_by / updated_by ทุก table
--   - เปลี่ยน ref_type/ref_id เป็น FK จริง
--   - เพิ่ม effective_date / expire_date ใน mapping tables
--   - เพิ่ม permission_level / scope_filter
--   - เพิ่ม SEQUENCE และ INDEX สำคัญ
-- ============================================================


-- ============================================================
-- 0. UTILITY: DROP ORDER (run ถ้า recreate)
-- ============================================================
/*
DROP TABLE user_custom_data_access_permission  CASCADE CONSTRAINTS PURGE;
DROP TABLE user_custom_data_access             CASCADE CONSTRAINTS PURGE;
DROP TABLE user_custom_object_permission       CASCADE CONSTRAINTS PURGE;
DROP TABLE user_custom_object_mapping          CASCADE CONSTRAINTS PURGE;
DROP TABLE user_role_mapping                   CASCADE CONSTRAINTS PURGE;
DROP TABLE user_responsibility_mapping         CASCADE CONSTRAINTS PURGE;
DROP TABLE user_info                        CASCADE CONSTRAINTS PURGE;

DROP TABLE responsibility_data_access_permission CASCADE CONSTRAINTS PURGE;
DROP TABLE responsibility_data_access          CASCADE CONSTRAINTS PURGE;
DROP TABLE responsibility_role_permission      CASCADE CONSTRAINTS PURGE;
DROP TABLE responsibility_role_mapping         CASCADE CONSTRAINTS PURGE;
DROP TABLE responsibility                      CASCADE CONSTRAINTS PURGE;

DROP TABLE role_object_permission              CASCADE CONSTRAINTS PURGE;
DROP TABLE role_object_mapping                 CASCADE CONSTRAINTS PURGE;
DROP TABLE role                                CASCADE CONSTRAINTS PURGE;

DROP TABLE sub_process                         CASCADE CONSTRAINTS PURGE;
DROP TABLE process                             CASCADE CONSTRAINTS PURGE;
DROP TABLE object                              CASCADE CONSTRAINTS PURGE;
DROP TABLE module                              CASCADE CONSTRAINTS PURGE;
DROP TABLE application                         CASCADE CONSTRAINTS PURGE;
DROP TABLE domain                              CASCADE CONSTRAINTS PURGE;
DROP TABLE object_type                         CASCADE CONSTRAINTS PURGE;
*/


-- ============================================================
-- 1. MASTER TABLES
-- ============================================================

CREATE TABLE object_type (
    id               NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code             VARCHAR2(50)    NOT NULL,
    name             VARCHAR2(100)   NOT NULL,   -- MENU, TAB, BUTTON
    description      VARCHAR2(255),
    is_active        NUMBER(1)       DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT uq_object_type_code UNIQUE (code),
    CONSTRAINT ck_object_type_active CHECK (is_active IN (0,1))
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE domain (
    id               NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code             VARCHAR2(50)    NOT NULL,
    name             VARCHAR2(200)   NOT NULL,
    description      VARCHAR2(500),
    domain_url       VARCHAR2(500) null,
    is_active        NUMBER(1)       DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT uq_domain_code UNIQUE (code),
    CONSTRAINT ck_domain_active CHECK (is_active IN (0,1))
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE application (
    id               NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain_id        NUMBER          NOT NULL,
    code             VARCHAR2(50)    NOT NULL,
    name             VARCHAR2(200)   NOT NULL,
    description      VARCHAR2(500),
    is_active        NUMBER(1)       DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_application_domain FOREIGN KEY (domain_id) REFERENCES domain(id),
    CONSTRAINT uq_application_domain_code UNIQUE (domain_id, code),
    CONSTRAINT ck_application_active CHECK (is_active IN (0,1))
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE module (
    id               NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id   NUMBER          NOT NULL,
    code             VARCHAR2(50)    NOT NULL,
    name             VARCHAR2(200)   NOT NULL,
    description      VARCHAR2(500),
    sort_order       NUMBER(5)       DEFAULT 0,
    is_active        NUMBER(1)       DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_module_application FOREIGN KEY (application_id) REFERENCES application(id),
    CONSTRAINT uq_module_code        UNIQUE (application_id, code),
    CONSTRAINT ck_module_active      CHECK (is_active IN (0,1))
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- OBJECT แบบ Tree (self-referencing)
CREATE TABLE object (
    id               NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    module_id        NUMBER          NOT NULL,
    object_type_id   NUMBER          NOT NULL,
    parent_id        NUMBER,                     -- self-join (NULL = root)
    code             VARCHAR2(100)   NOT NULL,
    name             VARCHAR2(200)   NOT NULL,
    path             VARCHAR2(2000),             -- /domain/app/module/object
    object_level     NUMBER(3)       DEFAULT 1,
    sort_order       NUMBER(5)       DEFAULT 0,
    is_active        NUMBER(1)       DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_object_module      FOREIGN KEY (module_id)      REFERENCES module(id),
    CONSTRAINT fk_object_type        FOREIGN KEY (object_type_id) REFERENCES object_type(id),
    CONSTRAINT fk_object_parent      FOREIGN KEY (parent_id)      REFERENCES object(id),
    CONSTRAINT uq_object_code        UNIQUE (module_id, code),
    CONSTRAINT ck_object_active      CHECK (is_active IN (0,1))
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE process (
    id               NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    module_id        NUMBER          NOT NULL,
    object_id        NUMBER,
    code             VARCHAR2(50)    NOT NULL,
    name             VARCHAR2(200)   NOT NULL,
    description      VARCHAR2(500),
    sort_order       NUMBER(5)       DEFAULT 0,
    is_active        NUMBER(1)       DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_process_module     FOREIGN KEY (module_id) REFERENCES module(id),
    CONSTRAINT fk_process_object     FOREIGN KEY (object_id) REFERENCES object(id),
    CONSTRAINT uq_process_code       UNIQUE (code),
    CONSTRAINT ck_process_active     CHECK (is_active IN (0,1))
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE sub_process (
    id               NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    process_id       NUMBER          NOT NULL,
    code             VARCHAR2(50)    NOT NULL,
    name             VARCHAR2(200)   NOT NULL,
    description      VARCHAR2(500),
    sort_order       NUMBER(5)       DEFAULT 0,
    is_active        NUMBER(1)       DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_subprocess_process FOREIGN KEY (process_id) REFERENCES process(id),
    CONSTRAINT uq_subprocess_code    UNIQUE (code),
    CONSTRAINT ck_subprocess_active  CHECK (is_active IN (0,1))
);


-- ============================================================
-- 2. ROLE (RBAC)
-- ============================================================

CREATE TABLE role (
    id               NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code             VARCHAR2(50)    NOT NULL,
    name             VARCHAR2(200)   NOT NULL,
    description      VARCHAR2(500),
    effective_date   DATE            DEFAULT SYSDATE NOT NULL,
    expire_date      DATE,
    is_active        NUMBER(1)       DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT uq_role_code          UNIQUE (code),
    CONSTRAINT ck_role_active        CHECK (is_active IN (0,1)),
    CONSTRAINT ck_role_expire        CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- role_object_mapping: ผูก Role กับ Object hierarchy จริง (ไม่ใช้ ref_type)
CREATE TABLE role_object_mapping (
    id               NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_id          NUMBER          NOT NULL,
    -- FK จริงทุกตัว (nullable — ใส่ตัวใดตัวหนึ่ง)
    domain_id        NUMBER,
    application_id   NUMBER,
    module_id        NUMBER,
    object_id        NUMBER,
    process_id       NUMBER,
    sub_process_id   NUMBER,
    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    effective_date   DATE            DEFAULT SYSDATE NOT NULL,
    expire_date      DATE,
    is_active        NUMBER(1)       DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_rom_role           FOREIGN KEY (role_id)        REFERENCES role(id),
    CONSTRAINT fk_rom_domain         FOREIGN KEY (domain_id)      REFERENCES domain(id),
    CONSTRAINT fk_rom_application    FOREIGN KEY (application_id) REFERENCES application(id),
    CONSTRAINT fk_rom_module         FOREIGN KEY (module_id)      REFERENCES module(id),
    CONSTRAINT fk_rom_object         FOREIGN KEY (object_id)      REFERENCES object(id),
    CONSTRAINT fk_rom_process        FOREIGN KEY (process_id)     REFERENCES process(id),
    CONSTRAINT fk_rom_subprocess     FOREIGN KEY (sub_process_id) REFERENCES sub_process(id),
    CONSTRAINT ck_rom_active         CHECK (is_active IN (0,1)),
    -- บังคับให้ใส่อย่างน้อย 1 FK
    CONSTRAINT ck_rom_ref_required   CHECK (
        domain_id IS NOT NULL OR application_id IS NOT NULL OR
        module_id IS NOT NULL OR object_id IS NOT NULL OR
        process_id IS NOT NULL OR sub_process_id IS NOT NULL
    )
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE role_object_permission (
    id                    NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_object_mapping_id NUMBER     NOT NULL,
    can_view              NUMBER(1)   DEFAULT 0 NOT NULL,
    can_create            NUMBER(1)   DEFAULT 0 NOT NULL,
    can_edit              NUMBER(1)   DEFAULT 0 NOT NULL,
    can_delete            NUMBER(1)   DEFAULT 0 NOT NULL,
    can_approve           NUMBER(1)   DEFAULT 0 NOT NULL,
    can_export            NUMBER(1)   DEFAULT 0 NOT NULL,
    can_print             NUMBER(1)   DEFAULT 0 NOT NULL,
    permission_level      VARCHAR2(20) DEFAULT 'CUSTOM',  -- FULL, READ_ONLY, RESTRICTED, CUSTOM
    scope_filter          VARCHAR2(500),                   -- เช่น "dept_id = :user_dept"
    created_by            VARCHAR2(36),
    updated_by            VARCHAR2(36),
    created_at            TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at            TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_rop_mapping    FOREIGN KEY (role_object_mapping_id) REFERENCES role_object_mapping(id),
    CONSTRAINT uq_rop_mapping    UNIQUE (role_object_mapping_id),
    CONSTRAINT ck_rop_view       CHECK (can_view   IN (0,1)),
    CONSTRAINT ck_rop_create     CHECK (can_create IN (0,1)),
    CONSTRAINT ck_rop_edit       CHECK (can_edit   IN (0,1)),
    CONSTRAINT ck_rop_delete     CHECK (can_delete IN (0,1)),
    CONSTRAINT ck_rop_approve    CHECK (can_approve IN (0,1)),
    CONSTRAINT ck_rop_export     CHECK (can_export IN (0,1)),
    CONSTRAINT ck_rop_level      CHECK (permission_level IN ('FULL','READ_ONLY','RESTRICTED','CUSTOM'))
);


-- ============================================================
-- 3. RESPONSIBILITY
-- ============================================================

CREATE TABLE responsibility (
    id               NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code             VARCHAR2(50)    NOT NULL,
    name             VARCHAR2(200)   NOT NULL,
    description      VARCHAR2(500),
    effective_date   DATE            DEFAULT SYSDATE NOT NULL,
    expire_date      DATE,
    is_active        NUMBER(1)       DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT uq_responsibility_code  UNIQUE (code),
    CONSTRAINT ck_responsibility_active CHECK (is_active IN (0,1)),
    CONSTRAINT ck_responsibility_expire CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE responsibility_role_mapping (
    id                  NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    responsibility_id   NUMBER      NOT NULL,
    role_id             NUMBER      NOT NULL,
    effective_date      DATE        DEFAULT SYSDATE NOT NULL,
    expire_date         DATE,
    is_active           NUMBER(1)   DEFAULT 1   NOT NULL,
    created_by          VARCHAR2(36),
    updated_by          VARCHAR2(36),
    created_at          TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at          TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_rrm_responsibility FOREIGN KEY (responsibility_id) REFERENCES responsibility(id),
    CONSTRAINT fk_rrm_role          FOREIGN KEY (role_id)           REFERENCES role(id),
    CONSTRAINT uq_rrm               UNIQUE (responsibility_id, role_id),
    CONSTRAINT ck_rrm_active        CHECK (is_active IN (0,1)),
    CONSTRAINT ck_rrm_expire        CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE responsibility_role_permission (
    id                          NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    responsibility_role_mapping_id NUMBER   NOT NULL,
    can_view                    NUMBER(1)   DEFAULT 0 NOT NULL,
    can_create                  NUMBER(1)   DEFAULT 0 NOT NULL,
    can_edit                    NUMBER(1)   DEFAULT 0 NOT NULL,
    can_delete                  NUMBER(1)   DEFAULT 0 NOT NULL,
    can_approve                 NUMBER(1)   DEFAULT 0 NOT NULL,
    can_export                  NUMBER(1)   DEFAULT 0 NOT NULL,
    permission_level            VARCHAR2(20) DEFAULT 'CUSTOM',
    scope_filter                VARCHAR2(500),
    created_by                  VARCHAR2(36),
    updated_by                  VARCHAR2(36),
    created_at                  TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at                  TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_rrp_mapping   FOREIGN KEY (responsibility_role_mapping_id) REFERENCES responsibility_role_mapping(id),
    CONSTRAINT uq_rrp_mapping   UNIQUE (responsibility_role_mapping_id),
    CONSTRAINT ck_rrp_level     CHECK (permission_level IN ('FULL','READ_ONLY','RESTRICTED','CUSTOM'))
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- สิทธิการให้ข้อมูล (Data Access ระดับ Responsibility)
CREATE TABLE responsibility_data_access (
    id                  NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    responsibility_id   NUMBER      NOT NULL,
    object_id           NUMBER      NOT NULL,
    access_level        VARCHAR2(20) DEFAULT 'READ' NOT NULL,  -- READ, WRITE, RESTRICTED
    scope_filter        VARCHAR2(500),
    effective_date      DATE        DEFAULT SYSDATE NOT NULL,
    expire_date         DATE,
    is_active           NUMBER(1)   DEFAULT 1   NOT NULL,
    created_by          VARCHAR2(36),
    updated_by          VARCHAR2(36),
    created_at          TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at          TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_rda_responsibility FOREIGN KEY (responsibility_id) REFERENCES responsibility(id),
    CONSTRAINT fk_rda_object         FOREIGN KEY (object_id)         REFERENCES object(id),
    CONSTRAINT uq_rda                UNIQUE (responsibility_id, object_id),
    CONSTRAINT ck_rda_access_level   CHECK (access_level IN ('READ','WRITE','RESTRICTED')),
    CONSTRAINT ck_rda_active         CHECK (is_active IN (0,1))
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE responsibility_data_access_permission (
    id                              NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    responsibility_data_access_id   NUMBER      NOT NULL,
    can_view                        NUMBER(1)   DEFAULT 0 NOT NULL,
    can_export                      NUMBER(1)   DEFAULT 0 NOT NULL,
    can_share                       NUMBER(1)   DEFAULT 0 NOT NULL,
    can_print                       NUMBER(1)   DEFAULT 0 NOT NULL,
    created_by                      VARCHAR2(36),
    updated_by                      VARCHAR2(36),
    created_at                      TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at                      TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_rdap_data_access  FOREIGN KEY (responsibility_data_access_id) REFERENCES responsibility_data_access(id),
    CONSTRAINT uq_rdap              UNIQUE (responsibility_data_access_id)
);


-- ============================================================
-- 4. USER
-- ============================================================

CREATE TABLE "IAMX".user_info ( user_info_id varchar(40) NULL,
    public_user_info varchar(40) NULL,
    first_name varchar(100) NULL,
    last_name varchar(100) NULL,
    phone varchar(50) NULL,
    mobile varchar(50) NULL,
    ref_user_id varchar(40) NULL,
    agency_code varchar(5) NULL,
    agency_type varchar(40) NULL,
    user_type varchar(20) NULL,
    personal_card_id varchar(20) NULL,
    created_date timestamp NULL,
    updated_date timestamp NULL,
    updated_by varchar(40) NULL,
    created_by varchar(40) NULL,
    status varchar(20) NULL,
    user_name varchar(50) NULL,
    email varchar(100) NULL,
    first_name_eng varchar(100) NULL,
    last_name_eng varchar(100) NULL,
    profile_img varchar(40) NULL,
    prefix varchar(40) NULL,
    "PASSWORD" varchar(256) NULL,
    otp varchar(6) NULL,
    otp_code varchar(10) NULL,
    last_login_date timestamp NULL,
    user_position_id varchar(40) NULL,
    user_ministry_id varchar(40) NULL,
    user_division_id varchar(40) NULL,
    user_agency_id varchar(40) NULL,
    user_operation_id varchar(40) NULL,
    flag_agency varchar(1) NULL,
    login_type varchar(1) NULL,
    birth_date DATE NULL,
    group_user varchar(40) NULL,
    regis_flag varchar(1) NULL,
    address bytea NULL,
    comment_type varchar(40) NULL,
    education varchar(40) NULL,
    interest varchar(2000) NULL,
    reason_withdraw varchar(40) NULL,
    accessrights varchar(40) NULL,
    user_code varchar(20) NULL,
    verify_flag varchar(1) NULL,
    user_department_id varchar(40) NULL,
    employee_id varchar(40) NULL);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- User → Responsibility (รับสิทธิจากกลุ่ม)
CREATE TABLE user_responsibility_mapping (
    id                  NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             VARCHAR2(36)      NOT NULL,
    responsibility_id   NUMBER      NOT NULL,
    effective_date      DATE        DEFAULT SYSDATE NOT NULL,
    expire_date         DATE,
    is_active           NUMBER(1)   DEFAULT 1   NOT NULL,
    created_by          VARCHAR2(36),
    updated_by          VARCHAR2(36),
    created_at          TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at          TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_urm_user           FOREIGN KEY (user_id)           REFERENCES user_info(id),
    CONSTRAINT fk_urm_responsibility FOREIGN KEY (responsibility_id) REFERENCES responsibility(id),
    CONSTRAINT uq_urm                UNIQUE (user_id, responsibility_id),
    CONSTRAINT ck_urm_active         CHECK (is_active IN (0,1)),
    CONSTRAINT ck_urm_expire         CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- User → Role (รับ Role โดยตรง)
CREATE TABLE user_role_mapping (
    id               NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          VARCHAR2(36)      NOT NULL,
    role_id          NUMBER      NOT NULL,
    effective_date   DATE        DEFAULT SYSDATE NOT NULL,
    expire_date      DATE,
    is_active        NUMBER(1)   DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_url_user     FOREIGN KEY (user_id) REFERENCES user_info(id),
    CONSTRAINT fk_url_role     FOREIGN KEY (role_id) REFERENCES role(id),
    CONSTRAINT uq_url          UNIQUE (user_id, role_id),
    CONSTRAINT ck_url_active   CHECK (is_active IN (0,1)),
    CONSTRAINT ck_url_expire   CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- User Custom Override (ผูก User กับ Object โดยตรง ชนะทุกอย่าง)
CREATE TABLE user_custom_object_mapping (
    id               NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          VARCHAR2(36)      NOT NULL,
    -- FK จริงทุกตัว (nullable — ใส่ตัวใดตัวหนึ่ง)
    domain_id        NUMBER,
    application_id   NUMBER,
    module_id        NUMBER,
    object_id        NUMBER,
    process_id       NUMBER,
    sub_process_id   NUMBER,
    -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    override_reason  VARCHAR2(500),
    effective_date   DATE        DEFAULT SYSDATE NOT NULL,
    expire_date      DATE,
    is_active        NUMBER(1)   DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_ucom_user          FOREIGN KEY (user_id)        REFERENCES user_info(id),
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE user_custom_object_permission (
    id                           NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_custom_object_mapping_id NUMBER     NOT NULL,
    can_view                     NUMBER(1)   DEFAULT 0 NOT NULL,
    can_create                   NUMBER(1)   DEFAULT 0 NOT NULL,
    can_edit                     NUMBER(1)   DEFAULT 0 NOT NULL,
    can_delete                   NUMBER(1)   DEFAULT 0 NOT NULL,
    can_approve                  NUMBER(1)   DEFAULT 0 NOT NULL,
    can_export                   NUMBER(1)   DEFAULT 0 NOT NULL,
    can_print                    NUMBER(1)   DEFAULT 0 NOT NULL,
    permission_level             VARCHAR2(20) DEFAULT 'CUSTOM',
    scope_filter                 VARCHAR2(500),
    created_by                   VARCHAR2(36),
    updated_by                   VARCHAR2(36),
    created_at                   TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at                   TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_ucop_mapping   FOREIGN KEY (user_custom_object_mapping_id) REFERENCES user_custom_object_mapping(id),
    CONSTRAINT uq_ucop_mapping   UNIQUE (user_custom_object_mapping_id),
    CONSTRAINT ck_ucop_level     CHECK (permission_level IN ('FULL','READ_ONLY','RESTRICTED','CUSTOM'))
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- User Custom Data Access (สิทธิการเห็นข้อมูล ระดับ User)
CREATE TABLE user_custom_data_access (
    id               NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          VARCHAR2(36)      NOT NULL,
    object_id        NUMBER      NOT NULL,
    access_level     VARCHAR2(20) DEFAULT 'READ' NOT NULL,
    scope_filter     VARCHAR2(500),
    override_reason  VARCHAR2(500),
    effective_date   DATE        DEFAULT SYSDATE NOT NULL,
    expire_date      DATE,
    is_active        NUMBER(1)   DEFAULT 1   NOT NULL,
    created_by       VARCHAR2(36),
    updated_by       VARCHAR2(36),
    created_at       TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at       TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_ucda_user      FOREIGN KEY (user_id)   REFERENCES user_info(id),
    CONSTRAINT fk_ucda_object    FOREIGN KEY (object_id) REFERENCES object(id),
    CONSTRAINT uq_ucda           UNIQUE (user_id, object_id),
    CONSTRAINT ck_ucda_access    CHECK (access_level IN ('READ','WRITE','RESTRICTED')),
    CONSTRAINT ck_ucda_active    CHECK (is_active IN (0,1)),
    CONSTRAINT ck_ucda_expire    CHECK (expire_date IS NULL OR expire_date >= effective_date)
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE user_custom_data_access_permission (
    id                          NUMBER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_custom_data_access_id  NUMBER      NOT NULL,
    can_view                    NUMBER(1)   DEFAULT 0 NOT NULL,
    can_export                  NUMBER(1)   DEFAULT 0 NOT NULL,
    can_share                   NUMBER(1)   DEFAULT 0 NOT NULL,
    can_print                   NUMBER(1)   DEFAULT 0 NOT NULL,
    created_by                  VARCHAR2(36),
    updated_by                  VARCHAR2(36),
    created_at                  TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    updated_at                  TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT fk_ucdap_access  FOREIGN KEY (user_custom_data_access_id) REFERENCES user_custom_data_access(id),
    CONSTRAINT uq_ucdap         UNIQUE (user_custom_data_access_id)
);


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
CREATE INDEX idx_rda_responsibility ON responsibility_data_access(responsibility_id);
CREATE INDEX idx_rda_object         ON responsibility_data_access(object_id);

-- user mappings
CREATE INDEX idx_urm_user           ON user_responsibility_mapping(user_id);
CREATE INDEX idx_urm_respon         ON user_responsibility_mapping(responsibility_id);
CREATE INDEX idx_urm_active         ON user_responsibility_mapping(is_active);
CREATE INDEX idx_url_user           ON user_role_mapping(user_id);
CREATE INDEX idx_url_role           ON user_role_mapping(role_id);
CREATE INDEX idx_ucom_user          ON user_custom_object_mapping(user_id);
CREATE INDEX idx_ucom_object        ON user_custom_object_mapping(object_id);
CREATE INDEX idx_ucda_user          ON user_custom_data_access(user_id);
CREATE INDEX idx_ucda_object        ON user_custom_data_access(object_id);


-- ============================================================
-- 6. EFFECTIVE PERMISSION VIEW
--    Resolve Priority: Custom > Responsibility > Role
-- ============================================================

CREATE OR REPLACE VIEW v_user_effective_permission AS
-- Priority 3: จาก Role (ผ่าน Responsibility หรือ Direct)
SELECT
    ua.id           AS user_id,
    ua.username,
    obj.id          AS object_id,
    obj.code        AS object_code,
    rop.can_view,
    rop.can_create,
    rop.can_edit,
    rop.can_delete,
    rop.can_approve,
    rop.can_export,
    rop.permission_level,
    rop.scope_filter,
    'ROLE'          AS permission_source,
    3               AS priority
FROM user_info ua
JOIN user_role_mapping       url  ON url.user_id  = ua.id   AND url.is_active  = 1
JOIN role                    r    ON r.id          = url.role_id AND r.is_active = 1
JOIN role_object_mapping     rom  ON rom.role_id   = r.id    AND rom.is_active  = 1
JOIN role_object_permission  rop  ON rop.role_object_mapping_id = rom.id
JOIN object                  obj  ON obj.id        = rom.object_id
WHERE SYSDATE BETWEEN url.effective_date AND NVL(url.expire_date, SYSDATE)

UNION ALL

-- Priority 2: จาก Responsibility
SELECT
    ua.id           AS user_id,
    ua.username,
    obj.id          AS object_id,
    obj.code        AS object_code,
    rrp.can_view,
    rrp.can_create,
    rrp.can_edit,
    rrp.can_delete,
    rrp.can_approve,
    rrp.can_export,
    rrp.permission_level,
    rrp.scope_filter,
    'RESPONSIBILITY' AS permission_source,
    2               AS priority
FROM user_info ua
JOIN user_responsibility_mapping urm ON urm.user_id          = ua.id   AND urm.is_active = 1
JOIN responsibility               resp ON resp.id             = urm.responsibility_id AND resp.is_active = 1
JOIN responsibility_role_mapping  rrm  ON rrm.responsibility_id = resp.id AND rrm.is_active = 1
JOIN responsibility_role_permission rrp ON rrp.responsibility_role_mapping_id = rrm.id
JOIN role                         r    ON r.id                = rrm.role_id
JOIN role_object_mapping          rom  ON rom.role_id         = r.id AND rom.is_active = 1
JOIN object                       obj  ON obj.id              = rom.object_id
WHERE SYSDATE BETWEEN urm.effective_date AND NVL(urm.expire_date, SYSDATE)

UNION ALL

-- Priority 1: Custom Override (ชนะสุด)
SELECT
    ua.id           AS user_id,
    ua.username,
    obj.id          AS object_id,
    obj.code        AS object_code,
    ucop.can_view,
    ucop.can_create,
    ucop.can_edit,
    ucop.can_delete,
    ucop.can_approve,
    ucop.can_export,
    ucop.permission_level,
    ucop.scope_filter,
    'CUSTOM'        AS permission_source,
    1               AS priority
FROM user_info ua
JOIN user_custom_object_mapping  ucom ON ucom.user_id  = ua.id   AND ucom.is_active = 1
JOIN user_custom_object_permission ucop ON ucop.user_custom_object_mapping_id = ucom.id
JOIN object                      obj  ON obj.id        = ucom.object_id
WHERE SYSDATE BETWEEN ucom.effective_date AND NVL(ucom.expire_date, SYSDATE);


-- ============================================================
-- END OF SCRIPT
-- ============================================================

