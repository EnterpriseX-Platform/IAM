-- ============================================================
-- Migration: IAMX.ROLE.ID  NUMBER -> CUID VARCHAR2(36)
-- ============================================================
-- Run order:
--   1. Run PART 1 of this script (drop FK constraints)
--   2. Run: go run ./cmd/migrate-role-id --oracle=<DSN>
--      (generates CUIDs; swaps role.id in ROLE + all FK child tables;
--       uses add/populate/drop/rename pattern for ORA-01439 safety)
--   3. Run PART 3 of this script (re-create FK constraints)
--
-- Pre-conditions:
--   * Take a full schema backup before running.
--   * Run as DBA or schema owner with ALTER TABLE privilege.
--   * ROLE.ID is still NUMBER at step 1;
--     the Go binary handles all role_id column type changes.
-- ============================================================


-- ============================================================
-- PART 1: Drop FK constraints that reference ROLE(id)
-- ============================================================

ALTER TABLE IAMX.ROLE_OBJECT_MAPPING          DROP CONSTRAINT fk_rom_role;
ALTER TABLE IAMX.RESPONSIBILITY_ROLE_MAPPING  DROP CONSTRAINT fk_rrm_role;
ALTER TABLE IAMX.USER_ROLE_MAPPING            DROP CONSTRAINT fk_url_role;
-- fk_ucda_role added by migrate_add_role_id_to_ucda.sql — may not exist
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS DROP CONSTRAINT fk_ucda_role';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

-- APP.M_DEPARTMENT.ROLE_ID may have a FK to IAMX.role(id)
-- Constraint name is unknown; query ALL_CONSTRAINTS to find and drop it.
BEGIN
  FOR c IN (
    SELECT ac.CONSTRAINT_NAME, ac.TABLE_NAME
    FROM ALL_CONSTRAINTS ac
    JOIN ALL_CONS_COLUMNS acc ON ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME
                             AND ac.OWNER = acc.OWNER
                             AND ac.TABLE_NAME = acc.TABLE_NAME
    WHERE ac.OWNER = 'APP'
      AND ac.TABLE_NAME = 'M_DEPARTMENT'
      AND ac.CONSTRAINT_TYPE = 'R'
      AND acc.COLUMN_NAME = 'ROLE_ID'
  ) LOOP
    EXECUTE IMMEDIATE 'ALTER TABLE APP.' || c.TABLE_NAME || ' DROP CONSTRAINT ' || c.CONSTRAINT_NAME;
  END LOOP;
END;
/


-- ============================================================
-- >>> RUN Go binary here <<<
--   go run ./cmd/migrate-role-id --oracle=<DSN>
--
-- What the binary does:
--   1. Saves old id → id_old (IAMX.ROLE) and role_id → role_id_old
--      (all FK child tables) as VARCHAR2 backup columns.
--   2. Generates CUIDs, populates _new columns, swaps NUMBER → VARCHAR2.
--   3. Recreates any composite unique constraints/indexes dropped above.
-- ============================================================


-- ============================================================
-- PART 3: Re-create FK constraints (run AFTER Go binary)
-- ROLE.ID is now VARCHAR2(36) — types match.
-- ============================================================

ALTER TABLE IAMX.ROLE_OBJECT_MAPPING
    ADD CONSTRAINT fk_rom_role
    FOREIGN KEY (role_id) REFERENCES IAMX.ROLE(id);

ALTER TABLE IAMX.RESPONSIBILITY_ROLE_MAPPING
    ADD CONSTRAINT fk_rrm_role
    FOREIGN KEY (role_id) REFERENCES IAMX.ROLE(id);

ALTER TABLE IAMX.USER_ROLE_MAPPING
    ADD CONSTRAINT fk_url_role
    FOREIGN KEY (role_id) REFERENCES IAMX.ROLE(id);

ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS
    ADD CONSTRAINT fk_ucda_role
    FOREIGN KEY (role_id) REFERENCES IAMX.ROLE(id);

-- APP.M_DEPARTMENT.ROLE_ID FK — recreate if it existed before (name may differ)
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE APP.M_DEPARTMENT
    ADD CONSTRAINT fk_mdept_role
    FOREIGN KEY (role_id) REFERENCES IAMX.ROLE(id)';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/


-- ============================================================
-- PART 4: Verify views still compile (run after PART 3)
-- ============================================================
-- SELECT COUNT(*) FROM IAMX.V_USER_EFFECTIVE_PERMISSION WHERE ROWNUM <= 1;
-- SELECT COUNT(*) FROM IAMX.V_USER_EFFECTIVE_DATA_ACCESS WHERE ROWNUM <= 1;
