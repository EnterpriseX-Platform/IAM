package tech.oneweb.keycloak.auth;

import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Set;

/**
 *
 * ตัดสินจาก IAMX: บัญชี inactive (สมัครยังไม่สำเร็จ) และคำร้องล่าสุดยังไม่จบ
 * ถูกปฏิเสธแล้ว (inactive + คำร้องล่าสุด NOT_APPROVE) ยังเข้าได้ — portal จะพาไปหน้าสมัครใหม่
 * ฐานข้อมูลล่ม = ปล่อยผ่าน (fail open) ไม่ให้คนทั้งระบบเข้าไม่ได้เพราะด่านนี้
 *
 * ข้อความเป็นคีย์ pendingApproval — ตั้งข้อความที่ Realm settings > Localization (realm overrides)
 */
public class PendingApprovalAuthenticator implements Authenticator {

    private static final Logger LOG = Logger.getLogger(PendingApprovalAuthenticator.class);
    static final String MESSAGE_KEY = "pendingApproval";
    private static final Set<String> FINISHED = Set.of("DIRECTOR_AUDIT", "NOT_APPROVE1", "NOT_APPROVE2", "CANCEL", "CANCELED");

    private static final String SQL =
        "SELECT ui.STATUS, " +
        "       (SELECT f.STATUS FROM APP.USER_REQUESTED r " +
        "          JOIN APP.USER_REQUESTED_FORM f ON f.USER_REQ_FORM_ID = r.USER_REQ_FORM_ID " +
        "         WHERE r.USER_INFO_ID = ui.USER_INFO_ID AND r.DELETED_DATE IS NULL " +
        "         ORDER BY f.CREATED_DATE DESC FETCH FIRST 1 ROWS ONLY) AS LAST_STATUS " +
        "  FROM IAMX.USER_INFO ui " +
        " WHERE LOWER(ui.EMAIL) = LOWER(?) OR LOWER(ui.USER_NAME) = LOWER(?) " +
        " ORDER BY CASE WHEN LOWER(ui.STATUS) = 'active' THEN 0 ELSE 1 END, ui.CREATED_DATE DESC " +
        " FETCH FIRST 1 ROWS ONLY";

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        UserModel user = context.getUser();
        if (user == null) {
            context.attempted();
            return;
        }
        if (isPending(user)) {
            LOG.infof("login blocked: approval pending for %s", user.getUsername());
            boolean brokered = context.getAuthenticationSession().getAuthNote("PBL_BROKERED_IDENTITY_CONTEXT") != null
                || context.getAuthenticationSession().getAuthNote("BROKERED_CONTEXT") != null;
            Response challenge = brokered
                ? context.form().setError(MESSAGE_KEY).createErrorPage(Response.Status.FORBIDDEN)
                : context.form().setError(MESSAGE_KEY).createLoginUsernamePassword();
            context.failureChallenge(AuthenticationFlowError.USER_DISABLED, challenge);
            return;
        }
        context.success();
    }

    private boolean isPending(UserModel user) {
        String email = user.getEmail() != null ? user.getEmail() : "";
        String username = user.getUsername() != null ? user.getUsername() : "";
        try (Connection c = oracle(); PreparedStatement ps = c.prepareStatement(SQL)) {
            ps.setString(1, email.isEmpty() ? username : email);
            ps.setString(2, username);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return false;
                String status = rs.getString(1);
                String last = rs.getString(2);
                return status != null && status.equalsIgnoreCase("inactive")
                    && last != null && !FINISHED.contains(last);
            }
        } catch (Exception e) {
            LOG.warnf("pending-approval check failed (allowing login): %s", e.getMessage());
            return false;
        }
    }

    private static Connection oracle() throws SQLException {
        String url = "jdbc:oracle:thin:@//" + env("ORACLE_HOST", "localhost") + ":" + env("ORACLE_PORT", "1521")
            + "/" + env("ORACLE_SERVICE", "IAMXDB");
        String pass = System.getenv("ORACLE_PASSWORD");
        if (pass == null || pass.isEmpty()) throw new SQLException("ORACLE_PASSWORD not set");
        DriverManager.setLoginTimeout(5);
        return DriverManager.getConnection(url, env("ORACLE_USER", "APP"), pass);
    }

    private static String env(String k, String d) {
        String v = System.getenv(k);
        return v == null || v.isEmpty() ? d : v;
    }

    @Override public void action(AuthenticationFlowContext context) { context.attempted(); }
    @Override public boolean requiresUser() { return true; }
    @Override public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) { return true; }
    @Override public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) { }
    @Override public void close() { }
}
