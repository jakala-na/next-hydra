import { Schema } from "effect";

export const AuthProviderCapabilities = Schema.Struct({
  companyMemberInvitationIssuance: Schema.Boolean,
  registrationOnboarding: Schema.Boolean,
});
export type AuthProviderCapabilities = typeof AuthProviderCapabilities.Type;
