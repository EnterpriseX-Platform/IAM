package tech.oneweb.keycloak.mapper;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jboss.logging.Logger;
import org.keycloak.models.ClientSessionContext;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.ProtocolMapperModel;
import org.keycloak.models.UserSessionModel;
import org.keycloak.protocol.oidc.mappers.AbstractOIDCProtocolMapper;
import org.keycloak.protocol.oidc.mappers.OIDCAccessTokenMapper;
import org.keycloak.protocol.oidc.mappers.OIDCAttributeMapperHelper;
import org.keycloak.protocol.oidc.mappers.OIDCIDTokenMapper;
import org.keycloak.protocol.oidc.mappers.UserInfoTokenMapper;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.representations.IDToken;

public class IamxUserInfoMapper
        extends AbstractOIDCProtocolMapper
        implements OIDCAccessTokenMapper, OIDCIDTokenMapper, UserInfoTokenMapper {

    private static final Logger logger = Logger.getLogger(IamxUserInfoMapper.class);

    public static final String PROVIDER_ID = "iamx-userinfo-mapper";
    public static final String CLAIM_USERINFO = "USERINFO";
    public static final String CLAIM_USER_ROLE = "USERROLE";
    public static final String CLAIM_USER_ROLE_TYPE = "USERROLETYPE";
    public static final String CLAIM_RESPONSIBILITY = "RESPONSIBILITY";
    public static final String CLAIM_PERMISSION = "PERMISSION";

    private static final String ORACLE_USER_INFO_SQL =
        "SELECT ui.USER_ID, ui.USER_INFO_ID, ui.REF_USER_ID, ui.USER_NAME, ui.FIRST_NAME, ui.LAST_NAME, " +
        "       ui.FIRST_NAME || ' ' || ui.LAST_NAME AS FULL_NAME, ui.PHONE, ui.MOBILE, " +
        "       ui.EMAIL, ma.AGC_ID AS AGENCY_ID, ma.AGC_CODE AS AGENCY_CODE, " +
        "       ma.AGC_TYPE AS AGENCY_TYPE, ma.AGC_NAME AS AGENCY_NAME, ma.AGC_SHORTNAME, " +
        "       CASE WHEN ma3.AGC_ID IS NOT NULL THEN ma3.AGC_ID ELSE ma2.AGC_ID END AS MINISTRY_ID, " +
        "       CASE WHEN ma3.AGC_CODE IS NOT NULL THEN ma3.AGC_CODE ELSE ma2.AGC_CODE END AS MINISTRY_CODE, " +
        "       CASE WHEN ma3.AGC_NAME IS NOT NULL THEN ma3.AGC_NAME ELSE ma2.AGC_NAME END AS MINISTRY_NAME, " +
        "       NVL(ma.AGC_SP_FLAG, 'N') AS AGC_SP_FLAG, rp.PROVINCE_NAME, rd.DISTRICT_NAME, rs.SUBDISTRICT_NAME, " +
        "       CASE WHEN ma2.AGC_NAME = 'องค์กรปกครองส่วนท้องถิ่น' THEN 'Y' ELSE 'N' END AS AGC_LGO_FLAG, " +
        "       CASE WHEN ma.AGC_TYPE IN ('MUNICIPALITY','SUBDISTRICT_MUNICIPALITY','PROVINCIAL_ADMINISTRATIVE_ORGANIZATION'," +
        "            'SPECIAL_LOCAL_ADMINISTRATION_ORGANIZATION','LOCAL_GOVERNMENT_ORG','CITY_MUNICIPALITY') THEN 'N' ELSE 'Y' END AS AGC_CENTER_FLAG, " +
        "       ui.USER_DEPARTMENT_ID, ui.USER_OPERATION_ID, " +
        "       ma4.AGC_ID AS SUBAGENCY_ID, ma4.AGC_CODE AS SUBAGENCY_CODE, ma4.AGC_NAME AS SUBAGENCY_NAME, " +
        "       NVL(md.DEPARTMENT_NAME, '') AS DEPARTMENT_NAME, ui.MOBILE AS TEL, " +
        "       mp.POSITION_NAME, " +
        "       CASE WHEN ui.USER_OPERATION_ID IS NOT NULL THEN 'SUBAGENCY' " +
        "            WHEN ui.USER_AGENCY_ID IS NOT NULL THEN 'AGENCY' " +
        "            WHEN ui.USER_MINISTRY_ID IS NOT NULL THEN 'MINISTRY' " +
        "            ELSE NULL END AS USER_LEVEL " +
        "  FROM APP.USER_INFO ui " +
        "  LEFT JOIN APP.M_AGC ma  ON ma.AGC_ID = ui.USER_AGENCY_ID " +
        "  LEFT JOIN APP.M_AGC ma2 ON ma.PARENT_ID = ma2.AGC_ID " +
        "  LEFT JOIN APP.M_AGC ma3 ON ma3.AGC_ID = ui.USER_MINISTRY_ID " +
        "  LEFT JOIN APP.M_AGC ma4 ON ma4.AGC_ID = ui.USER_OPERATION_ID " +
        "  LEFT JOIN APP.REF_PROVINCE rp  ON ma.PROVINCE_ID = rp.PROVINCE_ID " +
        "  LEFT JOIN APP.REF_DISTRICT rd  ON ma.DISTRICT_ID = rd.DISTRICT_ID " +
        "  LEFT JOIN APP.REF_SUBDISTRICT rs ON ma.SUBDISTRICT_ID = rs.SUBDISTRICT_ID " +
        "  LEFT JOIN APP.M_DEPARTMENT md ON ui.USER_DEPARTMENT_ID = md.DEPARTMENT_ID " +
        "  LEFT JOIN APP.M_POSITION mp   ON mp.POSITION_ID = ui.USER_POSITION_ID " +
        " WHERE LOWER(ui.EMAIL) = LOWER(?) OR LOWER(ui.USER_NAME) = LOWER(?) " +
        " ORDER BY CASE WHEN LOWER(ui.EMAIL) = LOWER(?) THEN 0 ELSE 1 END, " +
        "          CASE WHEN ui.REF_USER_ID IS NOT NULL THEN 0 ELSE 1 END " +
        " FETCH FIRST 1 ROW ONLY";

    private static final String ROLES_SQL =
        "SELECT DISTINCT r.CODE AS role_code, r.ROLE_TYPE AS role_type " +
        "  FROM IAMX.USER_ROLE_MAPPING urm " +
        "  JOIN IAMX.ROLE r ON r.ID = urm.ROLE_ID AND r.IS_ACTIVE = 1 " +
        " WHERE urm.USER_ID = ? AND urm.IS_ACTIVE = 1 " +
        "   AND TRUNC(SYSDATE) BETWEEN urm.EFFECTIVE_DATE AND NVL(urm.EXPIRE_DATE, TRUNC(SYSDATE)) " +
        " ORDER BY r.CODE";

    private static final String DATA_ACCESS_SQL =
        "SELECT responsibility_code, role_code, agency_path::text AS agency_path, " +
        "       scope_filter, data_permission, " +
        "       CASE priority WHEN 1 THEN 'CUSTOM' WHEN 2 THEN 'RESPONSIBILITY' " +
        "                     WHEN 3 THEN 'ROLE' ELSE 'UNKNOWN' END AS permission_source, " +
        "       priority " +
        "  FROM \"IAMX\".v_user_responsibility_detail " +
        " WHERE user_id = ? AND permission_type = 'DATA_ACCESS' " +
        " ORDER BY priority ASC, agency_path";

    private static final String PERMISSION_SQL =
        "SELECT DISTINCT ON (object_code) object_code, permission " +
        "  FROM \"IAMX\".v_user_effective_permission " +
        " WHERE user_id = ? " +
        " ORDER BY object_code, priority ASC";

    private static final List<ProviderConfigProperty> CONFIG_PROPERTIES = new ArrayList<>();

    static {
        OIDCAttributeMapperHelper.addIncludeInTokensConfig(CONFIG_PROPERTIES, IamxUserInfoMapper.class);
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return CONFIG_PROPERTIES;
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public String getDisplayType() {
        return "IAMX User Info Mapper";
    }

    @Override
    public String getDisplayCategory() {
        return "Token mapper";
    }

    @Override
    public String getHelpText() {
        return "Adds USERINFO (Oracle APP.USER_INFO + USER_LEVEL + AGC_CENTER_FLAG), "
             + "USERROLE (IAMX.USER_ROLE_MAPPING by cuid) claims to the JWT.";
    }

    @Override
    protected void setClaim(IDToken token, ProtocolMapperModel mapperModel,
                            UserSessionModel userSession, KeycloakSession keycloakSession,
                            ClientSessionContext clientSessionCtx) {
        String keycloakId = userSession.getUser().getId();
        String email = userSession.getUser().getEmail();
        String username = userSession.getUser().getUsername();
        try {
            Map<String, Object> userInfo = lookupOracleUserInfo(email, username);
            if (userInfo == null || userInfo.isEmpty()) return;

            token.getOtherClaims().put(CLAIM_USERINFO, userInfo);

            Object userIdObj = userInfo.get("USER_ID");
            if (userIdObj != null) {
                String userId = userIdObj.toString().trim();
                if (!userId.isEmpty()) {
                    List<Map<String, Object>> roleRows = lookupRoles(userId);
                    if (!roleRows.isEmpty()) {
                        // USERROLE stays a plain String[] of role codes — ~20 apps read it via
                        // asStringList(); DO NOT change its shape. ROLE_TYPE is exposed additively in a
                        // parallel USERROLETYPE claim [{CODE, ROLE_TYPE}] so existing consumers are untouched.
                        List<String> codes = new ArrayList<>();
                        for (Map<String, Object> rr : roleRows) {
                            Object code = rr.get("CODE");
                            if (code != null) codes.add(code.toString());
                        }
                        token.getOtherClaims().put(CLAIM_USER_ROLE, codes);
                        token.getOtherClaims().put(CLAIM_USER_ROLE_TYPE, roleRows);
                    }
                }
            }
        } catch (Exception e) {
            logger.errorf(e, "Failed to enrich token with USERINFO/USERROLE claim for keycloak_id=%s", keycloakId);
        }
    }

    private Map<String, Object> lookupOracleUserInfo(String email, String username) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        try (Connection c = openOracleConnection();
             PreparedStatement ps = c.prepareStatement(ORACLE_USER_INFO_SQL)) {
            ps.setString(1, email);
            ps.setString(2, username);
            ps.setString(3, email);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    ResultSetMetaData meta = rs.getMetaData();
                    for (int i = 1; i <= meta.getColumnCount(); i++) {
                        String colName = meta.getColumnLabel(i);
                        Object value = rs.getObject(i);
                        if (value != null) {
                            result.put(colName, value.toString());
                        } else {
                            result.put(colName, null);
                        }
                    }
                }
            }
        } catch (SQLException e) {
            logger.warnf(e, "Oracle user_info lookup failed for email=%s username=%s", email, username);
        }
        return result;
    }

    private List<Map<String, Object>> lookupRoles(String userId) {
        ArrayList<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = openOracleConnection();
             PreparedStatement ps = c.prepareStatement(ROLES_SQL)) {
            ps.setString(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String roleCode = rs.getString("role_code");
                    if (roleCode != null && !roleCode.isBlank()) {
                        LinkedHashMap<String, Object> row = new LinkedHashMap<>();
                        row.put("CODE", roleCode);
                        row.put("ROLE_TYPE", rs.getString("role_type")); // 'internal' | 'agency' (may be null)
                        out.add(row);
                    }
                }
            }
        } catch (SQLException e) {
            logger.warnf(e, "lookupRoles failed for user_id=%s", userId);
        }
        return out;
    }

    private Connection openOracleConnection() throws SQLException {
        String url = "jdbc:oracle:thin:@//" + env("ORACLE_HOST", "127.0.0.1") + ":"
                   + env("ORACLE_PORT", "1521") + "/" + env("ORACLE_SERVICE", "resdb");
        String user = env("ORACLE_USER", "APP");
        String pass = env("ORACLE_PASSWORD", null);
        if (pass == null) {
            throw new SQLException("ORACLE_PASSWORD env var not set — cannot read user_info");
        }
        return DriverManager.getConnection(url, user, pass);
    }

    private List<Map<String, Object>> lookupDataAccess(long userId) {
        ArrayList<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = openPostgresConnection();
             PreparedStatement ps = c.prepareStatement(DATA_ACCESS_SQL)) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    LinkedHashMap<String, Object> m = new LinkedHashMap<>();
                    putIfPresent(m, CLAIM_RESPONSIBILITY, rs.getString("responsibility_code"));
                    putIfPresent(m, "ROLE_CODE", rs.getString("role_code"));
                    m.put("AGENCY_PATH", rs.getString("agency_path"));
                    putIfPresent(m, "SCOPE_FILTER", rs.getString("scope_filter"));
                    m.put(CLAIM_PERMISSION, rs.getString("data_permission"));
                    m.put("PERMISSION_SOURCE", rs.getString("permission_source"));
                    m.put("PRIORITY", rs.getInt("priority"));
                    out.add(m);
                }
            }
        } catch (SQLException e) {
            logger.warnf(e, "lookupDataAccess failed for user_id=%d", userId);
        }
        return out;
    }

    private Map<String, Object> lookupPermissions(long userId) {
        LinkedHashMap<String, Object> out = new LinkedHashMap<>();
        try (Connection c = openPostgresConnection();
             PreparedStatement ps = c.prepareStatement(PERMISSION_SQL)) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String objectCode = rs.getString("object_code");
                    if (objectCode != null && !objectCode.isBlank()) {
                        out.put(objectCode, rs.getString("permission"));
                    }
                }
            }
        } catch (SQLException e) {
            logger.warnf(e, "lookupPermissions failed for user_id=%d", userId);
        }
        return out;
    }

    private Connection openPostgresConnection() throws SQLException {
        String host = env("IAMX_DB_HOST", "127.0.0.1");
        String port = env("IAMX_DB_PORT", "5444");
        String name = env("IAMX_DB_NAME", "iamx");
        String user = env("IAMX_DB_USER", "IAMX");
        String pass = env("IAMX_DB_PASSWORD", null);
        if (pass == null) {
            throw new SQLException("IAMX_DB_PASSWORD env var not set");
        }
        return DriverManager.getConnection("jdbc:postgresql://" + host + ":" + port + "/" + name, user, pass);
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return (v == null || v.isBlank()) ? def : v;
    }

    private static void putIfPresent(Map<String, Object> m, String key, Object value) {
        if (value == null) return;
        if (value instanceof String s && s.isBlank()) return;
        m.put(key, value);
    }
}
