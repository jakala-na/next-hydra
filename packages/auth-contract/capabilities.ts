import { Schema } from "effect";

export const AuthProviderCapabilities = Schema.Struct({
  registrationOnboarding: Schema.Boolean,
});
export type AuthProviderCapabilities = typeof AuthProviderCapabilities.Type;
