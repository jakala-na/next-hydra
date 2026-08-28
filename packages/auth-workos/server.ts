import "server-only";
import {
  AuthSessionAdapter,
  AuthRoutes,
  makeAuthSessionAdapter,
} from "@repo/auth-contract/session";
import {
  getSignInUrl as getWorkosSignInUrl,
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

export const getAuthRoutes = async (): Promise<AuthRoutes> =>
  Schema.decodeSync(AuthRoutes)({
    signInHref: await getSignInUrl(),
    signOutHref: "/api/auth/signout",
  });

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
