-- Migration: Remove RESPONSIBILITY_DATA_ACCESS tables, add permissions to RESPONSIBILITY,
-- add responsibility_id to USER_CUSTOM_DATA_ACCESS
-- Run as IAMX schema owner.

-- 1. Drop old data access tables (dependent first)
DROP TABLE IAMX.RESPONSIBILITY_DATA_ACCESS_PERMISSION;
DROP TABLE IAMX.RESPONSIBILITY_DATA_ACCESS;
DROP INDEX IAMX.idx_rda_responsibility;
DROP INDEX IAMX.idx_rda_agency;

-- 2. Add permissions JSON column to RESPONSIBILITY
ALTER TABLE IAMX.RESPONSIBILITY ADD (
    permissions VARCHAR2(500) DEFAULT '[]' NOT NULL
);

-- 3. Rename agency_id -> agency_path on USER_CUSTOM_DATA_ACCESS (if column is still named agency_id)
-- Skip this step if the column is already named agency_path in your environment.
-- ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS RENAME COLUMN agency_id TO agency_path;

-- 4. Add responsibility_id FK to USER_CUSTOM_DATA_ACCESS
ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS ADD (
    responsibility_id NUMBER,
    CONSTRAINT fk_ucda_responsibility FOREIGN KEY (responsibility_id) REFERENCES IAMX.RESPONSIBILITY(id)
);

-- 5. Drop old unique constraint, replace with function-based unique index
ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS DROP CONSTRAINT uq_ucda;
CREATE UNIQUE INDEX uq_ucda ON IAMX.USER_CUSTOM_DATA_ACCESS(user_id, NVL(responsibility_id, -1), agency_path);

-- 6. Add index on responsibility_id
DROP INDEX IAMX.idx_ucda_agency;
CREATE INDEX IAMX.idx_ucda_responsibility ON IAMX.USER_CUSTOM_DATA_ACCESS(responsibility_id);
