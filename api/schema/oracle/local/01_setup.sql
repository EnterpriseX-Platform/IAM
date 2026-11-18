-- ============================================================
-- Local dev — initial setup
-- Runs as SYSDBA in PDB (XEPDB1) before main DDL.
-- Creates IAMX user, APP user, M_AGC stub, IAMX.ADMIN (V1 keeper),
-- and grants IAMX REFERENCES on APP.M_AGC for cross-schema FK.
-- ============================================================

-- Verify we are inside the PDB (XEPDB1). Grants in CDB$ROOT against
-- a PDB user fail silently for cross-container privs, which is why the
-- earlier attempt produced "Grant succeeded" but ORA-01045 at login.
ALTER SESSION SET CONTAINER = XEPDB1;
SHOW CON_NAME;

-- Users — give DBA so we don't fight grant inheritance during local dev
CREATE USER IAMX IDENTIFIED BY iamxpw;
GRANT DBA TO IAMX;
ALTER USER IAMX QUOTA UNLIMITED ON USERS;

CREATE USER APP IDENTIFIED BY apppw;
GRANT DBA TO APP;
ALTER USER APP QUOTA UNLIMITED ON USERS;


-- M_AGC stub. Production ERP schema uses VARCHAR2(40) UUID for AGC_ID
-- (e.g. "000aa9c4-9db0-e1bd-11d1-2f1bcd452f06"). We mirror the column
-- shape that handlers query (AGC_TYPE / DATA_LEVEL_TYPE / STATUS) so
-- /oracle/agencies/* endpoints work locally without running cmd/migrate.
CREATE TABLE APP.M_AGC (
    AGC_ID          VARCHAR2(40) PRIMARY KEY,
    PARENT_ID       VARCHAR2(40) REFERENCES APP.M_AGC(AGC_ID),
    AGC_CODE        VARCHAR2(20),
    AGC_NAME        VARCHAR2(500),
    AGC_TYPE        VARCHAR2(50),
    DATA_LEVEL_TYPE VARCHAR2(20),
    STATUS          VARCHAR2(20)
);

INSERT INTO APP.M_AGC (AGC_ID, PARENT_ID, AGC_CODE, AGC_NAME, AGC_TYPE, DATA_LEVEL_TYPE, STATUS)
  VALUES ('stub-min-01', NULL,           '01',     'กระทรวงตัวอย่าง', 'MINISTRY',   'MIN',  'active');
INSERT INTO APP.M_AGC (AGC_ID, PARENT_ID, AGC_CODE, AGC_NAME, AGC_TYPE, DATA_LEVEL_TYPE, STATUS)
  VALUES ('stub-dept-0101', 'stub-min-01',  '0101', 'กรม A',            'DEPARTMENT', 'DEPT', 'active');
INSERT INTO APP.M_AGC (AGC_ID, PARENT_ID, AGC_CODE, AGC_NAME, AGC_TYPE, DATA_LEVEL_TYPE, STATUS)
  VALUES ('stub-dept-0102', 'stub-min-01',  '0102', 'กรม B',            'DEPARTMENT', 'DEPT', 'active');
INSERT INTO APP.M_AGC (AGC_ID, PARENT_ID, AGC_CODE, AGC_NAME, AGC_TYPE, DATA_LEVEL_TYPE, STATUS)
  VALUES ('stub-unit-A1',   'stub-dept-0101','010101','หน่วย A1',       'DIVISION',   'UNIT', 'active');
COMMIT;

GRANT REFERENCES, SELECT ON APP.M_AGC TO IAMX;

-- Empty ancillary stubs so handlers querying these tables return [] instead
-- of ORA-00942. Real data comes from cmd/migrate when run against the dev
-- Oracle source.
CREATE TABLE APP.REF_COMMON_DATA (
    COMMON_DATA_ID    VARCHAR2(40),
    COMMON_DATA_TYPE  VARCHAR2(40),
    COMMON_DATA_LABEL VARCHAR2(500)
);
GRANT SELECT ON APP.REF_COMMON_DATA TO IAMX;

CREATE TABLE APP.N_REF_PROCESS (
    PROCESS_ID     VARCHAR2(40) PRIMARY KEY,
    FISCAL_YEAR    NUMBER,
    PROCESS_CODE   VARCHAR2(40),
    PROCESS_NAME   VARCHAR2(500),
    DISPLAY_CODE   VARCHAR2(40),
    DISPLAY_NAME   VARCHAR2(500),
    MODULE_NAME    VARCHAR2(200),
    STATUS         VARCHAR2(20),
    SEQ            NUMBER,
    CREATED_DATE   DATE,
    CREATED_BY     VARCHAR2(40),
    UPDATED_DATE   DATE,
    UPDATED_BY     VARCHAR2(40),
    DELETED_DATE   DATE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON APP.N_REF_PROCESS TO IAMX;

CREATE TABLE APP.N_REF_SUBPROCESS (
    SUBPROCESS_ID    VARCHAR2(40) PRIMARY KEY,
    PROCESS_ID       VARCHAR2(40) REFERENCES APP.N_REF_PROCESS(PROCESS_ID),
    SUBPROCESS_CODE  VARCHAR2(40),
    SUBPROCESS_NAME  VARCHAR2(500),
    DISPLAY_CODE     VARCHAR2(40),
    DISPLAY_NAME     VARCHAR2(500),
    STATUS           VARCHAR2(20),
    SEQ              NUMBER,
    FISCAL_YEAR      NUMBER,
    CREATED_DATE     DATE,
    CREATED_BY       VARCHAR2(40),
    UPDATED_DATE     DATE,
    UPDATED_BY       VARCHAR2(40),
    DELETED_DATE     DATE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON APP.N_REF_SUBPROCESS TO IAMX;

CREATE TABLE APP.MV_PROCESS_MAPPING (
    PROCESS_ID              VARCHAR2(40),
    SUBPROCESS_ID           VARCHAR2(40),
    FISCAL_YEAR             NUMBER,
    PROCESS_CODE            VARCHAR2(40),
    SUBPROCESS_CODE         VARCHAR2(40),
    PROCESS_NAME            VARCHAR2(500),
    SUBPROCESS_NAME         VARCHAR2(500),
    DISPLAY_COMPONENT       VARCHAR2(200),
    DISPLAY_PROCESS_NAME    VARCHAR2(500),
    DISPLAY_SUBPROCESS_NAME VARCHAR2(500)
);
GRANT SELECT ON APP.MV_PROCESS_MAPPING TO IAMX;

CREATE TABLE APP.M_EMPLOYEE (
    EMP_ID    VARCHAR2(40) PRIMARY KEY,
    EMP_CODE  VARCHAR2(40),
    EMP_NAME  VARCHAR2(500)
);
GRANT SELECT ON APP.M_EMPLOYEE TO IAMX;

CREATE TABLE APP.M_PREFIX (
    PREFIX_ID    VARCHAR2(40) PRIMARY KEY,
    PREFIX_CODE  VARCHAR2(40),
    PREFIX_NAME  VARCHAR2(500)
);
GRANT SELECT ON APP.M_PREFIX TO IAMX;

-- Public synonym so handlers that query unqualified `M_AGC` find APP.M_AGC.
-- Production SIT pod connects as `app` user and finds it in own schema —
-- locally we connect as IAMX, so the synonym bridges that gap.
CREATE PUBLIC SYNONYM M_AGC              FOR APP.M_AGC;
CREATE PUBLIC SYNONYM N_REF_PROCESS      FOR APP.N_REF_PROCESS;
CREATE PUBLIC SYNONYM N_REF_SUBPROCESS   FOR APP.N_REF_SUBPROCESS;
CREATE PUBLIC SYNONYM MV_PROCESS_MAPPING FOR APP.MV_PROCESS_MAPPING;
CREATE PUBLIC SYNONYM M_EMPLOYEE         FOR APP.M_EMPLOYEE;
CREATE PUBLIC SYNONYM M_PREFIX           FOR APP.M_PREFIX;
CREATE PUBLIC SYNONYM REF_COMMON_DATA    FOR APP.REF_COMMON_DATA;


-- IAMX.ADMIN — ผู้ดูแล IAM-X Console (รหัสเก็บเป็น bcrypt เท่านั้น)
CREATE TABLE IAMX.ADMIN (
    USER_ID    VARCHAR2(40) PRIMARY KEY,
    USERNAME   VARCHAR2(50) NOT NULL UNIQUE,
    PASSWORD   VARCHAR2(256),
    FIRST_NAME VARCHAR2(100),
    LAST_NAME  VARCHAR2(100),
    STATUS     VARCHAR2(20),
    ROLE       VARCHAR2(50)
);

-- 28/10/69 (security): ไม่มี seed ผู้ดูแลรหัสตายตัวแล้ว — Login รับเฉพาะ bcrypt
-- สร้างผู้ดูแลคนแรกเอง: INSERT รหัสที่ hash ด้วย bcrypt (เช่น htpasswd -bnBC 12 "" '<รหัส>' | tr -d ':\n')
