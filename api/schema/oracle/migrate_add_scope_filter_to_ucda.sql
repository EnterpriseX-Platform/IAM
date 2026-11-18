-- Migration: add scope_filter column to USER_CUSTOM_DATA_ACCESS
--
-- Why: getDataAccess() in api/core/handlers/menu_handler.go selects
--   ucda.scope_filter as part of the /me/permissions query. The canonical
--   schema in api/schema/oracle/iamx.sql already declares this column
--   (VARCHAR2(500)), but SIT (and likely other) DBs were created from an
--   older revision that didn't have it yet, so the query 500s with
--   ORA-00904: "UCDA"."SCOPE_FILTER": invalid identifier.
--
-- Symptom (SIT pod iamx-app log, deploy a149a82):
--   [/me/permissions] getDataAccess failed for refUserID="420":
--     ORA-00904: "UCDA"."SCOPE_FILTER": invalid identifier
--   [09:40:41] 500 - GET /iamx/api/public/me/permissions (13.86ms)
--
-- Run as IAMX schema owner. Safe to run multiple times — DDL is a no-op
-- error if the column already exists, wrapped here to make the rerun
-- non-fatal so this can be added to deploy scripts without conditionals.

DECLARE
    column_exists NUMBER := 0;
BEGIN
    SELECT COUNT(*) INTO column_exists
    FROM all_tab_columns
    WHERE owner       = 'IAMX'
      AND table_name  = 'USER_CUSTOM_DATA_ACCESS'
      AND column_name = 'SCOPE_FILTER';

    IF column_exists = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE IAMX.USER_CUSTOM_DATA_ACCESS ADD (scope_filter VARCHAR2(500))';
        DBMS_OUTPUT.PUT_LINE('Added IAMX.USER_CUSTOM_DATA_ACCESS.scope_filter');
    ELSE
        DBMS_OUTPUT.PUT_LINE('IAMX.USER_CUSTOM_DATA_ACCESS.scope_filter already exists — skipped');
    END IF;
END;
/

COMMIT;
