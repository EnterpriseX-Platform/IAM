-- ============================================================
-- Migration: IAMX.USER_INFO.USER_ID  NUMBER -> CUID2 VARCHAR2(36)
-- ============================================================
-- Run order:
--   1. Run PART 1 + PART 2 + PART 3 of this script
--      (drop FK constraints, drop user_info_id, change created_by/updated_by)
--   2. Run: go run ./cmd/migrate-user-id --oracle=<DSN>
--      (generates CUIDs; swaps user_id in USER_INFO + all FK/chat tables;
--       remaps APP.USER_INFO — handles ORA-01439 via add/populate/drop/rename)
--   3. Run PART 4 of this script (re-create FK constraints)
--
-- Pre-conditions:
--   * Take a full schema backup before running.
--   * Run as DBA or schema owner with ALTER TABLE privilege.
--   * USER_INFO.USER_ID is still NUMBER at step 1;
--     the Go binary handles all user_id column type changes.
-- ============================================================


-- ============================================================
-- PART 1: Drop FK constraints that reference USER_INFO(user_id)
-- Oracle ORA-02267: cannot MODIFY child column type while
-- parent column is a different type, even with constraint disabled.
-- Must DROP entirely, then re-create after the Go binary runs.
-- ============================================================

ALTER TABLE IAMX.USER_ROLE_MAPPING           DROP CONSTRAINT fk_url_user;
ALTER TABLE IAMX.USER_RESPONSIBILITY_MAPPING  DROP CONSTRAINT fk_urm_user;
ALTER TABLE IAMX.USER_CUSTOM_OBJECT_MAPPING   DROP CONSTRAINT fk_ucom_user;
ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS      DROP CONSTRAINT fk_ucda_user;


-- Drop legacy UUID column (superseded by CUID2 user_id after migration)
ALTER TABLE IAMX.USER_INFO DROP COLUMN user_info_id;

-- NOTE: FK child user_id columns (USER_ROLE_MAPPING etc.) are NOT changed here.
-- Oracle ORA-01439 prevents MODIFY NUMBER->VARCHAR2 on non-empty columns.
-- The Go binary handles those via add/populate/drop/rename pattern.


-- ============================================================
-- PART 2: created_by / updated_by  NUMBER -> VARCHAR2(36)
-- (20 IAMX tables + APP.LOAN_USER_ROLE -- no FK constraints)
-- ============================================================

ALTER TABLE IAMX.PERMISSION_TYPE
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.OBJECT_TYPE
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.DOMAIN
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.APPLICATION
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.MODULE
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.OBJECT
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.PROCESS
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.SUB_PROCESS
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.ROLE
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.ROLE_OBJECT_MAPPING
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.ROLE_OBJECT_PERMISSION
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.RESPONSIBILITY
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.RESPONSIBILITY_ROLE_MAPPING
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.RESPONSIBILITY_ROLE_PERMISSION
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.USER_ROLE_MAPPING
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.USER_RESPONSIBILITY_MAPPING
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.USER_CUSTOM_OBJECT_MAPPING
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.USER_CUSTOM_OBJECT_PERMISSION
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION
    MODIFY (created_by VARCHAR2(36), updated_by VARCHAR2(36));

ALTER TABLE APP.LOAN_USER_ROLE MODIFY (user_id VARCHAR2(36));


-- ============================================================
-- >>> RUN Go binary here <<<
--   go run ./cmd/migrate-user-id --oracle=<DSN>
-- ============================================================


-- ============================================================
-- PART 4: Re-create FK constraints (run AFTER Go binary)
-- USER_INFO.USER_ID is now VARCHAR2(36) -- types match.
-- ============================================================

ALTER TABLE IAMX.USER_ROLE_MAPPING
    ADD CONSTRAINT fk_url_user
    FOREIGN KEY (user_id) REFERENCES IAMX.USER_INFO(user_id);

ALTER TABLE IAMX.USER_RESPONSIBILITY_MAPPING
    ADD CONSTRAINT fk_urm_user
    FOREIGN KEY (user_id) REFERENCES IAMX.USER_INFO(user_id);

ALTER TABLE IAMX.USER_CUSTOM_OBJECT_MAPPING
    ADD CONSTRAINT fk_ucom_user
    FOREIGN KEY (user_id) REFERENCES IAMX.USER_INFO(user_id);

ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS
    ADD CONSTRAINT fk_ucda_user
    FOREIGN KEY (user_id) REFERENCES IAMX.USER_INFO(user_id);


-- ============================================================
-- PART 5: Verify views still compile (run after PART 4)
-- ============================================================
-- SELECT COUNT(*) FROM IAMX.V_USER_EFFECTIVE_PERMISSION   WHERE ROWNUM <= 1;
-- SELECT COUNT(*) FROM IAMX.V_USER_RESPONSIBILITY_DETAIL  WHERE ROWNUM <= 1;
-- SELECT COUNT(*) FROM IAMX.V_USER_ROLE_DETAIL            WHERE ROWNUM <= 1;
