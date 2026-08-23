/* oxlint-disable require-await -- Authenticator test doubles implement an async provider boundary. */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  AccessTokenVerifier,
  accessTokenVerifierLayerFromAuthenticator,
  classifyClerkAccessTokenFailure,
} from "./access-token";

const clerkRequestFailureLayer = (reason: string) =>
  accessTokenVerifierLayerFromAuthenticator({
    authenticateAccessToken: async () =>
      classifyClerkAccessTokenFailure({
        message: `Clerk request failed: ${reason}`,
        reason,
      }),
  });

describe(AccessTokenVerifier, () => {
  it("validates a Clerk access token and adapts organization permissions", async () => {
    let verifiedToken: string | undefined;
    const layer = accessTokenVerifierLayerFromAuthenticator({
      authenticateAccessToken: async (token) => {
        verifiedToken = token;

        return {
          hasPermission: (permission) => permission === "org:registration:read",
          sessionId: "session-1",
          userId: "user-1",
        };
      },
      requiredPermissions: ["registration.read"],
    });

    const result = await Effect.runPromise(
      AccessTokenVerifier.verify("jwt-1").pipe(Effect.provide(layer))
    );

    expect(verifiedToken).toBe("jwt-1");
    expect(result).toMatchObject({
      authUserId: "user-1",
      sessionId: "session-1",
    });
    expect(result.permissions.has("registration.read")).toBeTruthy();
    expect(result.permissions.has("registration.decide")).toBeFalsy();
    expect(result.permissions.has("system:read")).toBeFalsy();
  });

  it("rejects an unauthenticated Clerk access token", async () => {
    const layer = accessTokenVerifierLayerFromAuthenticator({
      authenticateAccessToken: async () => null,
    });

    const error = await Effect.runPromise(
      AccessTokenVerifier.verify("invalid").pipe(
        Effect.flip,
        Effect.provide(layer)
      )
    );

    expect(error).toMatchObject({
      _tag: AccessTokenInvalid.name,
      reason: "invalidToken",
    });
  });

  it("rejects a token without the required domain permission", async () => {
    const layer = accessTokenVerifierLayerFromAuthenticator({
      authenticateAccessToken: async () => ({
        hasPermission: () => false,
        userId: "user-1",
      }),
      requiredPermissions: ["registration.read"],
    });

    const error = await Effect.runPromise(
      AccessTokenVerifier.verify("jwt-1").pipe(
        Effect.flip,
        Effect.provide(layer)
      )
    );

    expect(error).toMatchObject({
      _tag: AccessTokenInvalid.name,
      reason: "missingRequiredPermission",
    });
  });

  it("classifies coded transport failures as unavailable", async () => {
    const layer = accessTokenVerifierLayerFromAuthenticator({
      authenticateAccessToken: async () => {
        throw Object.assign(new Error("JWKS unavailable"), {
          code: "ECONNRESET",
        });
      },
    });

    const error = await Effect.runPromise(
      AccessTokenVerifier.verify("jwt-1").pipe(
        Effect.flip,
        Effect.provide(layer)
      )
    );

    expect(error).toMatchObject({
      _tag: AccessTokenVerificationFailure.name,
      reason: "unavailable",
    });
  });

  it.each(["unexpected-error", "secret-key-invalid"])(
    "classifies Clerk %s request states as unexpected verification failures",
    async (reason) => {
      const error = await Effect.runPromise(
        AccessTokenVerifier.verify("jwt-1").pipe(
          Effect.flip,
          Effect.provide(clerkRequestFailureLayer(reason))
        )
      );

      expect(error).toMatchObject({
        _tag: AccessTokenVerificationFailure.name,
        reason: "unexpected",
      });
    }
  );

  it.each([
    "token-invalid",
    "session-token-expired-refresh-non-eligible-no-refresh-cookie",
    "session-token-nbf",
    "session-token-iat-in-the-future",
  ])(
    "keeps Clerk %s request states in the invalid-token channel",
    async (reason) => {
      const error = await Effect.runPromise(
        AccessTokenVerifier.verify("jwt-1").pipe(
          Effect.flip,
          Effect.provide(clerkRequestFailureLayer(reason))
        )
      );

      expect(error).toMatchObject({
        _tag: AccessTokenInvalid.name,
        reason: "invalidToken",
      });
    }
  );

  it("classifies remote Clerk JWK failures as unavailable", async () => {
    const error = await Effect.runPromise(
      AccessTokenVerifier.verify("jwt-1").pipe(
        Effect.flip,
        Effect.provide(clerkRequestFailureLayer("jwk-remote-failed-to-load"))
      )
    );

    expect(error).toMatchObject({
      _tag: AccessTokenVerificationFailure.name,
      reason: "unavailable",
    });
  });
});
