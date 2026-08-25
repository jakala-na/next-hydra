import { accessTokenVerifierLayer } from "@repo/auth/access-token";

export const apiAuthenticationLayer = accessTokenVerifierLayer();
