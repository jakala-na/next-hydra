import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  AccessTokenVerifier,
  accessTokenVerifierLayerFromJwtVerifier,
} from "./access-token";

describe("AccessTokenVerifier", () => {
  it("verifies a WorkOS access token and returns the auth user id", async () => {
    let verifiedToken: string | undefined;
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      expectedClientId: "client_1",
      expectedIssuer: "https://api.workos.com/",
      requiredPermissions: ["checkout:read"],
      verifyAccessToken: (token) => {
        verifiedToken = token;
        return Promise.resolve({
          client_id: "client_1",
          iss: "https://api.workos.com",
          permissions: ["checkout:read", "checkout:write"],
          sid: "session-1",
          sub: "user-1",
        });
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
      verifyAccessToken: () => Promise.reject(joseError),
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

  it("rejects a verified token payload without an auth user id", async () => {
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      verifyAccessToken: () =>
        Promise.resolve({
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
      verifyAccessToken: () =>
        Promise.resolve({
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
      verifyAccessToken: () =>
        Promise.resolve({
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
      verifyAccessToken: () =>
        Promise.resolve({
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
      verifyAccessToken: () =>
        Promise.resolve({
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

  it("maps verifier runtime failures separately from invalid tokens", async () => {
    const layer = accessTokenVerifierLayerFromJwtVerifier({
      verifyAccessToken: () => Promise.reject(new Error("jwks unavailable")),
    });

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const verifier = yield* AccessTokenVerifier;
        return yield* verifier.verify("jwt-1").pipe(Effect.exit);
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        AccessTokenVerificationFailure.name
      );
    }
  });
});
