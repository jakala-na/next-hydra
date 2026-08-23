import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  AuthSession,
  AuthSessionAdapter,
  AuthRoutes,
  makeAuthSessionAdapter,
} from "@repo/auth-contract/session";
import { Effect, Layer, Schema } from "effect";

import {
  clerkSessionToAuthSession,
  domainPermissionToClerkPermission,
} from "./session";

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
export * from "@clerk/nextjs/server";

// oxlint-disable-next-line require-await -- Auth providers expose an async URL contract.
export const getSignInUrl = async () =>
  process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in";

export const getAuthRoutes = async (): Promise<AuthRoutes> =>
  Schema.decodeSync(AuthRoutes)({
    signInHref: await getSignInUrl(),
    signOutHref: "/sign-out",
  });

const anonymousSession = () =>
  new AuthSession({
    permissions: { has: () => false },
    user: null,
  });

const readClerkSessionSource = async () => {
  const authState = await auth();

  if (!authState.isAuthenticated) {
    return null;
  }

  const [accessToken, user] = await Promise.all([
    authState.getToken(),
    currentUser(),
  ]);

  return {
    accessToken,
    permissions: {
      has: (permission: string) => {
        const clerkPermission = domainPermissionToClerkPermission(permission);

        return clerkPermission
          ? authState.has({ permission: clerkPermission })
          : false;
      },
    },
    sessionId: authState.sessionId,
    user: user
      ? {
          email: user.primaryEmailAddress?.emailAddress ?? null,
          firstName: user.firstName,
          id: user.id,
          imageUrl: user.imageUrl,
          lastName: user.lastName,
        }
      : null,
    userId: authState.userId,
  };
};

export const authSessionAdapter = makeAuthSessionAdapter({
  decode: (session) =>
    session === null ? anonymousSession() : clerkSessionToAuthSession(session),
  failureMessage: "Failed to read the Clerk authentication session",
  provider: "clerk",
  read: readClerkSessionSource,
});

export const authSessionAdapterLayer = Layer.succeed(
  AuthSessionAdapter,
  authSessionAdapter
);

export const withAuth = async () =>
  await Effect.runPromise(
    AuthSessionAdapter.read.pipe(Effect.provide(authSessionAdapterLayer))
  );
