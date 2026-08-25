import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  AccessTokenVerifier,
  accessTokenVerifierLayerFromJwtVerifier,
  fetchWorkosJwks,
} from "./access-token";

describe(AccessTokenVerifier, () => {
  it("verifies a WorkOS access token and returns the auth user id", async () => {
    let verifiedToken: string | undefined;
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      expectedClientId: "client_1",
      expectedIssuer: "https://api.workos.com/",
      requiredPermissions: ["checkout:read"],
      verifyAccessToken: async (token) => {
        verifiedToken = token;
        return {
          client_id: "client_1",
          iss: "https://api.workos.com",
          permissions: ["checkout:read", "checkout:write"],
          sid: "session-1",
          sub: "user-1",
        };
      },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1");
      }).pipe(Effect.provide(layer))
    );

    expect(verifiedToken).toBe("jwt-1");
    expect(result).toMatchObject({
      authUserId: "user-1",
      permissions: ["checkout:read", "checkout:write"],
      sessionId: "session-1",
    });
  });

  it("rejects invalid WorkOS access tokens", async () => {
    const joseError = Object.assign(new Error("signature failed"), {
      code: "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
    });
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      verifyAccessToken: async () => {
        throw joseError;
      },
    });

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1").pipe(Effect.exit);
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(AccessTokenInvalid.name);
    }
  });

  it("rejects access tokens whose key is absent from the trusted JWKS", async () => {
    const joseError = Object.assign(new Error("no matching key"), {
      code: "ERR_JWKS_NO_MATCHING_KEY",
    });
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      verifyAccessToken: async () => {
        throw joseError;
      },
    });

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1").pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(error).toMatchObject({
      _tag: AccessTokenInvalid.name,
      reason: "invalidToken",
    });
  });

  it("rejects a verified token payload without an auth user id", async () => {
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      verifyAccessToken: async () => ({
        sid: "session-1",
      }),
    });

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1").pipe(Effect.exit);
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(AccessTokenInvalid.name);
    }
  });

  it("rejects a verified token payload that is missing required permissions", async () => {
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      requiredPermissions: ["checkout:read"],
      verifyAccessToken: async () => ({
        permissions: ["profile:read"],
        sid: "session-1",
        sub: "user-1",
      }),
    });

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1").pipe(Effect.exit);
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(AccessTokenInvalid.name);
    }
  });

  it("rejects a verified token payload from an unexpected issuer", async () => {
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      expectedIssuer: "https://api.workos.com",
      verifyAccessToken: async () => ({
        client_id: "client_1",
        iss: "https://evil.example.com",
        sub: "user-1",
      }),
    });

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1").pipe(Effect.exit);
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(AccessTokenInvalid.name);
    }
  });

  it("accepts the expected client through the token audience", async () => {
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      expectedClientId: "client_1",
      verifyAccessToken: async () => ({
        aud: ["client_1", "api"],
        iss: "https://api.workos.com",
        sub: "user-1",
      }),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1");
      }).pipe(Effect.provide(layer))
    );

    expect(result.authUserId).toBe("user-1");
  });

  it("rejects a verified token payload for an unexpected client", async () => {
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      expectedClientId: "client_1",
      verifyAccessToken: async () => ({
        client_id: "client_other",
        iss: "https://api.workos.com",
        sub: "user-1",
      }),
    });

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1").pipe(Effect.exit);
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(AccessTokenInvalid.name);
    }
  });

  it("classifies unknown verifier failures as unexpected", async () => {
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      verifyAccessToken: async () => {
        throw new Error("jwks unavailable");
      },
    });

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1").pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(error).toMatchObject({
      _tag: AccessTokenVerificationFailure.name,
      reason: "unexpected",
    });
  });

  it("does not infer verifier availability from TypeError alone", async () => {
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      verifyAccessToken: async () => {
        throw new TypeError("fetch failed");
      },
    });

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1").pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(error).toMatchObject({
      _tag: "AccessTokenVerificationFailure",
      reason: "unexpected",
    });
  });

  it("classifies coded verifier transport failures as unavailable", async () => {
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      verifyAccessToken: async () => {
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("socket reset"), {
            code: "ECONNRESET",
          }),
        });
      },
    });

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1").pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(error).toMatchObject({
      _tag: "AccessTokenVerificationFailure",
      reason: "unavailable",
    });
  });

  it("preserves JWKS server failures as unavailable verification errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });

    try {
      const error = await fetchWorkosJwks("https://api.workos.com/jwks", {
        headers: new Headers(),
        method: "GET",
        redirect: "manual",
        signal: new AbortController().signal,
      }).catch((error: unknown) => error);
      const layer = accessTokenVerifierLayerFromJwtVerifier({
        verifyAccessToken: async () => {
          throw error;
        },
      });

      const verificationError = await Effect.runPromise(
        Effect.gen(function* () {
          const verifier = yield* AccessTokenVerifier;
          return yield* verifier.verify("jwt-1").pipe(Effect.flip);
        }).pipe(Effect.provide(layer))
      );

      expect(verificationError).toMatchObject({
        _tag: AccessTokenVerificationFailure.name,
        reason: "unavailable",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
