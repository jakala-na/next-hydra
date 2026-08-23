import "server-only";
import {
  AuthSessionAdapter,
  AuthRoutes,
  makeAuthSessionAdapter,
} from "@repo/auth-contract/session";
import {
  getSignInUrl as getWorkosSignInUrl,
  getSignUpUrl as getWorkosSignUpUrl,
  withAuth as withWorkosAuth,
} from "@workos-inc/authkit-nextjs";
import { Effect, Layer, Schema } from "effect";

import { workosSessionToAuthSession } from "./session";

export {
  AuthSessionAdapter,
  AuthSessionReadFailure,
  AuthRoutes,
} from "@repo/auth-contract/session";
export type {
  AuthPermissionAdapter,
  AuthSession,
  AuthUser,
} from "@repo/auth-contract/session";
export {
  handleAuth,
  refreshSession,
  signOut,
} from "@workos-inc/authkit-nextjs";

export const getSignInUrl = getWorkosSignInUrl;
export const getSignUpUrl = getWorkosSignUpUrl;

export const getAuthRoutes = async (): Promise<AuthRoutes> => {
  const [signInHref, signUpHref] = await Promise.all([
    getSignInUrl(),
    getSignUpUrl(),
  ]);

  return Schema.decodeSync(AuthRoutes)({
    signInHref,
    signOutHref: "/api/auth/signout",
    signUpHref,
  });
};

export const authSessionAdapter = makeAuthSessionAdapter({
  decode: workosSessionToAuthSession,
  failureMessage: "Failed to read the WorkOS authentication session",
  provider: "workos",
  read: async () => await withWorkosAuth(),
});

export const authSessionAdapterLayer = Layer.succeed(
  AuthSessionAdapter,
  authSessionAdapter
);

export const withAuth = async () =>
  await Effect.runPromise(
    AuthSessionAdapter.read.pipe(Effect.provide(authSessionAdapterLayer))
  );
