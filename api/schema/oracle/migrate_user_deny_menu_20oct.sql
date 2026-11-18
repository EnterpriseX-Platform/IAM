-- ผู้ใช้ที่ไม่มีแถว DENY ได้ผลเหมือนเดิมทุกแถว (ตรวจด้วย snapshot ก่อน/หลัง)
CREATE OR REPLACE VIEW IAMX.V_USER_EFFECTIVE_PERMISSION AS
SELECT "USER_ID","USER_NAME","OBJECT_ID","OBJECT_CODE","OBJECT_ICON","OBJECT_TYPE_CODE","MODULE_ID","MODULE_CODE","MODULE_ICON","MODULE_SORT_ORDER","APPLICATION_ID","APPLICATION_CODE","APPLICATION_ICON","DOMAIN_ID","DOMAIN_CODE","PERMISSION","PERMISSION_LEVEL","SCOPE_FILTER","PERMISSION_SOURCE","PRIORITY","ROLE_ID","ROLE_CODE","ALL_DATA_ACCESS","DEFAULT_AGENCY_PATH","EXTRA_DA_JSON" FROM (
SELECT
    ui.user_id,
    ui.user_name,
    obj.id           AS object_id,
    obj.code         AS object_code,
    CAST(NULL AS VARCHAR2(100)) AS object_icon,
    ot.code          AS object_type_code,
    mod.id           AS module_id,
    mod.code         AS module_code,
    mod.icon         AS module_icon,
    mod.sort_order   AS module_sort_order,
    app.id           AS application_id,
    app.code         AS application_code,
    app.icon         AS application_icon,
    dom.id           AS domain_id,
    dom.code         AS domain_code,
    rop.permission,
    rop.permission_level,
    rop.scope_filter,
    'ROLE'                      AS permission_source,
    3                           AS priority,
    r.id                        AS role_id,
    r.code                      AS role_code,
    r.all_data_access,
    CASE
        WHEN agm.AGC_CODE IS NOT NULL AND aga.AGC_CODE IS NOT NULL AND agd.AGC_CODE IS NOT NULL
            THEN agm.AGC_CODE || '.' || aga.AGC_CODE || '.' || agd.AGC_CODE
        WHEN agm.AGC_CODE IS NOT NULL AND aga.AGC_CODE IS NOT NULL
            THEN agm.AGC_CODE || '.' || aga.AGC_CODE
        WHEN agm.AGC_CODE IS NOT NULL
            THEN agm.AGC_CODE
        ELSE NULL
    END AS default_agency_path,
    COALESCE(
        (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                KEY 'agency_path' VALUE ucda.agency_path
            )
         )
         FROM user_custom_data_access ucda
         WHERE ucda.user_id = ui.user_id
           AND (ucda.role_id = r.id OR ucda.role_id IS NULL)
           AND NVL(ucda.type, 'AGENCY') = 'AGENCY'
           AND ucda.is_active = 1
           AND SYSDATE BETWEEN ucda.effective_date AND NVL(ucda.expire_date, SYSDATE)
        ), '[]'
    ) AS extra_da_json
FROM user_info                  ui
JOIN user_role_mapping          url  ON url.user_id = ui.user_id AND url.is_active = 1
JOIN role                       r    ON r.id = url.role_id       AND r.is_active   = 1
JOIN role_object_mapping        rom  ON rom.role_id = r.id       AND rom.is_active = 1
JOIN role_object_permission     rop  ON rop.role_object_mapping_id = rom.id
JOIN object                     obj  ON obj.id = rom.object_id AND obj.IS_ACTIVE = 1
JOIN object_type                ot   ON ot.id = obj.object_type_id
JOIN module                     mod  ON mod.id = obj.module_id AND MOD.IS_ACTIVE = 1
JOIN application                app  ON app.id = mod.application_id AND app.IS_ACTIVE = 1
JOIN domain                     dom  ON dom.id = app.domain_id AND dom.IS_ACTIVE = 1
LEFT JOIN APP.M_AGC             agm  ON agm.AGC_ID = ui.user_ministry_id
LEFT JOIN APP.M_AGC             aga  ON aga.AGC_ID = ui.user_agency_id
LEFT JOIN APP.M_AGC             agd  ON agd.AGC_ID = ui.user_department_id
WHERE SYSDATE BETWEEN url.effective_date AND NVL(url.expire_date, SYSDATE)
  -- 20/10/69 ถอดเมนูรายคน: สิทธิ์เฉพาะคน permission = ["DENY"] ตัดเมนูนี้ที่ได้จากบทบาท
  AND NOT EXISTS (SELECT 1 FROM user_custom_object_mapping dm
                    JOIN user_custom_object_permission dp ON dp.user_custom_object_mapping_id = dm.id
                   WHERE dm.user_id = ui.user_id AND dm.object_id = obj.id AND dm.is_active = 1
                     AND dp.permission = '["DENY"]'
                     AND SYSDATE BETWEEN dm.effective_date AND NVL(dm.expire_date, SYSDATE))

UNION ALL

-- Priority 1: User Custom Override (highest)
SELECT
    ui.user_id,
    ui.user_name,
    obj.id           AS object_id,
    obj.code         AS object_code,
    CAST(NULL AS VARCHAR2(100)) AS object_icon,
    ot.code          AS object_type_code,
    mod.id           AS module_id,
    mod.code         AS module_code,
    mod.icon         AS module_icon,
    mod.sort_order   AS module_sort_order,
    app.id           AS application_id,
    app.code         AS application_code,
    app.icon         AS application_icon,
    dom.id           AS domain_id,
    dom.code         AS domain_code,
    ucop.permission,
    ucop.permission_level,
    ucop.scope_filter,
    'CUSTOM'                    AS permission_source,
    1                           AS priority,
    CAST(NULL AS VARCHAR2(36))  AS role_id,
    CAST(NULL AS VARCHAR2(50))  AS role_code,
    0                           AS all_data_access,
    CASE
        WHEN agm.AGC_CODE IS NOT NULL AND aga.AGC_CODE IS NOT NULL AND agd.AGC_CODE IS NOT NULL
            THEN agm.AGC_CODE || '.' || aga.AGC_CODE || '.' || agd.AGC_CODE
        WHEN agm.AGC_CODE IS NOT NULL AND aga.AGC_CODE IS NOT NULL
            THEN agm.AGC_CODE || '.' || aga.AGC_CODE
        WHEN agm.AGC_CODE IS NOT NULL
            THEN agm.AGC_CODE
        ELSE NULL
    END AS default_agency_path,
    COALESCE(
        (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                KEY 'agency_path' VALUE ucda.agency_path
            )
         )
         FROM user_custom_data_access ucda
         WHERE ucda.user_id = ui.user_id
           AND ucda.role_id IS NULL
           AND NVL(ucda.type, 'AGENCY') = 'AGENCY'
           AND ucda.is_active = 1
           AND SYSDATE BETWEEN ucda.effective_date AND NVL(ucda.expire_date, SYSDATE)
        ), '[]'
    ) AS extra_da_json
FROM user_info                       ui
JOIN user_custom_object_mapping      ucom ON ucom.user_id = ui.user_id AND ucom.is_active = 1
JOIN user_custom_object_permission   ucop ON ucop.user_custom_object_mapping_id = ucom.id
JOIN object                          obj  ON obj.id = ucom.object_id AND obj.IS_ACTIVE = 1
JOIN object_type                     ot   ON ot.id = obj.object_type_id
JOIN module                          mod  ON mod.id = obj.module_id AND MOD.IS_ACTIVE = 1
JOIN application                     app  ON app.id = mod.application_id AND app.IS_ACTIVE = 1
JOIN domain                          dom  ON dom.id = app.domain_id AND dom.IS_ACTIVE = 1
LEFT JOIN APP.M_AGC                  agm  ON agm.AGC_ID = ui.user_ministry_id
LEFT JOIN APP.M_AGC                  aga  ON aga.AGC_ID = ui.user_agency_id
LEFT JOIN APP.M_AGC                  agd  ON agd.AGC_ID = ui.user_department_id
WHERE SYSDATE BETWEEN ucom.effective_date AND NVL(ucom.expire_date, SYSDATE)
)
WHERE PERMISSION IS NOT NULL AND PERMISSION != '[]' AND PERMISSION != '["DENY"]'
/
