import { AuthProviderCapabilities } from "@repo/auth-contract/capabilities";
import { Schema } from "effect";

export const authCapabilities = Schema.decodeSync(AuthProviderCapabilities)({
  registrationOnboarding: false,
});
