import { accessTokenVerifierLayer } from "@repo/auth/access-token";
import { identityUsersLayerFromConfig } from "@repo/auth/identity-users";

export const adminAuthenticationLayer = accessTokenVerifierLayer({
  configPrefix: "ADMIN",
});

export const adminIdentityUsersLayer = identityUsersLayerFromConfig({
  configPrefix: "ADMIN",
});
