import { createClerkClient } from "@clerk/nextjs/server";
import {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  AccessTokenVerifier,
  AuthUserId,
  VerifiedAccessToken,
  validateRequiredAccessTokenPermissions,
} from "@repo/auth-contract/access-token";
import { hasTransientTransportCode } from "@repo/errors/transport";
import { Config, Effect, Layer, Option, Schema } from "effect";

import { domainPermissionToClerkPermission } from "./session";

const CLERK_JWKS_UNAVAILABLE_CODE = "CLERK_JWKS_UNAVAILABLE";
const CLERK_REMOTE_JWK_FAILURE_REASON = "jwk-remote-failed-to-load";
const CLERK_EXPIRED_SESSION_TOKEN_REFRESH_REASON_PREFIX =
  "session-token-expired-refresh-";
const INVALID_CLERK_ACCESS_TOKEN_REASONS = new Set([
  "jwk-kid-mismatch",
  "session-token-expired",
  "session-token-iat-in-the-future",
  "session-token-nbf",
  "token-expired",
  "token-iat-in-the-future",
  "token-invalid",
  "token-invalid-algorithm",
  "token-invalid-authorized-parties",
  "token-invalid-signature",
  "token-not-active-yet",
  "token-type-mismatch",
  "token-verification-failed",
]);

const isInvalidClerkAccessTokenReason = (reason: string) =>
  INVALID_CLERK_ACCESS_TOKEN_REASONS.has(reason) ||
  reason.startsWith(CLERK_EXPIRED_SESSION_TOKEN_REFRESH_REASON_PREFIX);

export {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  AccessTokenVerifier,
  AuthUserId,
  VerifiedAccessToken,
  authPermissionsFrom,
  validateRequiredAccessTokenPermissions,
} from "@repo/auth-contract/access-token";

export interface ClerkAccessTokenAuthentication {
  readonly hasPermission: (permission: `org:${string}:${string}`) => boolean;
  readonly sessionId?: string;
  readonly userId: string;
}

export type ClerkAccessTokenAuthenticator = (
  token: string
) => Promise<ClerkAccessTokenAuthentication | null>;

export interface ClerkAccessTokenVerifierOptions {
  readonly authenticateAccessToken: ClerkAccessTokenAuthenticator;
  readonly requiredPermissions?: readonly string[];
}

const invalidToken = () =>
  new AccessTokenInvalid({
    message: "Invalid Clerk access token",
    reason: "invalidToken",
  });

const invalidClaims = () =>
  new AccessTokenInvalid({
    message: "Clerk access token does not contain required claims",
    reason: "invalidClaims",
  });

const toAccessTokenVerificationError = (cause: unknown) =>
  new AccessTokenVerificationFailure({
    cause,
    message: "Failed to verify Clerk access token",
    reason: hasTransientTransportCode(cause, [CLERK_JWKS_UNAVAILABLE_CODE])
      ? "unavailable"
      : "unexpected",
  });

export const classifyClerkAccessTokenFailure = ({
  message,
  reason,
}: {
  readonly message: string;
  readonly reason: string;
}) => {
  if (reason === CLERK_REMOTE_JWK_FAILURE_REASON) {
    throw Object.assign(new Error(message), {
      code: CLERK_JWKS_UNAVAILABLE_CODE,
    });
  }

  if (isInvalidClerkAccessTokenReason(reason)) {
    return null;
  }

  throw new Error(`Clerk access token verification failed: ${reason}`, {
    cause: message,
  });
};

const toVerifiedAccessToken = (
  authentication: ClerkAccessTokenAuthentication
) => {
  const token = Schema.decodeSync(VerifiedAccessToken)({
    authUserId: AuthUserId.make(authentication.userId),
    permissions: {
      has: (permission: string) => {
        const clerkPermission = domainPermissionToClerkPermission(permission);

        return clerkPermission === null
          ? false
          : authentication.hasPermission(clerkPermission);
      },
    },
  });

  return authentication.sessionId === undefined
    ? token
    : Schema.decodeSync(VerifiedAccessToken)({
        authUserId: token.authUserId,
        permissions: token.permissions,
        sessionId: authentication.sessionId,
      });
};

const makeClerkAccessTokenVerifier = ({
  authenticateAccessToken,
  requiredPermissions = [],
}: ClerkAccessTokenVerifierOptions) =>
  AccessTokenVerifier.of({
    verify: Effect.fn("AccessTokenVerifier.verify")((token) =>
      Effect.tryPromise({
        catch: toAccessTokenVerificationError,
        try: async () => await authenticateAccessToken(token),
      }).pipe(
        Effect.flatMap((authentication) =>
          authentication === null
            ? Effect.fail(invalidToken())
            : Effect.succeed(authentication)
        ),
        Effect.flatMap((authentication) =>
          authentication.userId.length === 0
            ? Effect.fail(invalidClaims())
            : Effect.succeed(authentication)
        ),
        Effect.map(toVerifiedAccessToken),
        Effect.flatMap((verifiedToken) =>
          validateRequiredAccessTokenPermissions(
            verifiedToken,
            requiredPermissions
          )
        )
      )
    ),
  });

export const accessTokenVerifierLayerFromAuthenticator = (
  options: ClerkAccessTokenVerifierOptions
) => Layer.succeed(AccessTokenVerifier, makeClerkAccessTokenVerifier(options));

const parseAuthorizedParties = (value: string) =>
  value.split(",").map((party) => party.trim());

export const accessTokenVerifierLayer = ({
  requiredPermissions = [],
}: {
  readonly requiredPermissions?: readonly string[];
} = {}) =>
  Layer.effect(
    AccessTokenVerifier,
    Effect.gen(function* () {
      const publishableKey = yield* Config.string(
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
      );
      const secretKey = yield* Config.string("CLERK_SECRET_KEY");
      const jwtKey = yield* Config.option(Config.string("CLERK_JWT_KEY")).pipe(
        Effect.map(Option.getOrUndefined)
      );
      const authorizedParties = yield* Config.schema(
        Schema.NonEmptyString,
        "CLERK_AUTHORIZED_PARTIES"
      ).pipe(Effect.map(parseAuthorizedParties));
      const clerk =
        jwtKey === undefined
          ? createClerkClient({ publishableKey, secretKey })
          : createClerkClient({ jwtKey, publishableKey, secretKey });

      return makeClerkAccessTokenVerifier({
        authenticateAccessToken: async (token) => {
          const requestState = await clerk.authenticateRequest(
            new Request("https://api.next-hydra.invalid", {
              headers: { authorization: `Bearer ${token}` },
            }),
            {
              acceptsToken: "session_token",
              authorizedParties,
            }
          );

          if (!requestState.isAuthenticated) {
            return classifyClerkAccessTokenFailure(requestState);
          }

          const authentication = requestState.toAuth();

          return {
            hasPermission: (permission) => authentication.has({ permission }),
            sessionId: authentication.sessionId,
            userId: authentication.userId,
          };
        },
        requiredPermissions,
      });
    })
  );
