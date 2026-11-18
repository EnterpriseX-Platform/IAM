package tech.oneweb.keycloak.auth;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

import java.util.List;

public class PendingApprovalAuthenticatorFactory implements AuthenticatorFactory {
    public static final String ID = "iamx-pending-approval";
    private static final PendingApprovalAuthenticator SINGLETON = new PendingApprovalAuthenticator();

    @Override public String getId() { return ID; }
    @Override public String getDisplayType() { return "IAMX: Block login while approval pending"; }
    @Override public String getHelpText() { return "Deny login when IAMX account is inactive and the latest registration request is still pending."; }
    @Override public String getReferenceCategory() { return "iamx-approval"; }
    @Override public boolean isConfigurable() { return false; }
    @Override public boolean isUserSetupAllowed() { return false; }
    @Override public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return new AuthenticationExecutionModel.Requirement[] {
            AuthenticationExecutionModel.Requirement.REQUIRED, AuthenticationExecutionModel.Requirement.DISABLED };
    }
    @Override public List<ProviderConfigProperty> getConfigProperties() { return List.of(); }
    @Override public Authenticator create(KeycloakSession session) { return SINGLETON; }
    @Override public void init(Config.Scope config) { }
    @Override public void postInit(KeycloakSessionFactory factory) { }
    @Override public void close() { }
}
