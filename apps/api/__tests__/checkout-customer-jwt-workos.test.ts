import {
  VerifiedWorkosAccessToken,
  WorkosAccessTokenInvalid,
  WorkosAccessTokenVerificationFailure,
  WorkosAccessTokenVerifier,
  WorkosAuthUserId,
} from "@repo/auth-workos/access-token";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  CheckoutCustomerJwtInvalid,
  CheckoutCustomerJwtVerificationFailure,
  CheckoutCustomerJwtVerifier,
} from "../lib/checkout/customer-jwt";
import { checkoutCustomerJwtVerifierLayerWorkos } from "../lib/checkout/customer-jwt-workos";

type WorkosVerify = Parameters<
  typeof WorkosAccessTokenVerifier.of
>[0]["verify"];

const makeLayer = (verify: WorkosVerify) =>
  checkoutCustomerJwtVerifierLayerWorkos.pipe(
    Layer.provide(
      Layer.succeed(
        WorkosAccessTokenVerifier,
        WorkosAccessTokenVerifier.of({ verify })
      )
    )
  );

describe("checkoutCustomerJwtVerifierLayerWorkos", () => {
  it("maps a verified WorkOS access token subject to commerce AuthUserId", async () => {
    const layer = makeLayer(() =>
      Effect.succeed(
        new VerifiedWorkosAccessToken({
          authUserId: WorkosAuthUserId.make("user-1"),
        })
      )
    );

    const authUserId = await Effect.runPromise(
      CheckoutCustomerJwtVerifier.verify("jwt-1").pipe(Effect.provide(layer))
    );

    expect(authUserId).toBe("user-1");
  });

  it("maps invalid WorkOS access tokens to checkout JWT invalid errors", async () => {
    const layer = makeLayer(() =>
      Effect.fail(
        new WorkosAccessTokenInvalid({
          message: "Invalid WorkOS access token",
          reason: "invalidToken",
        })
      )
    );

    const exit = await Effect.runPromise(
      CheckoutCustomerJwtVerifier.verify("jwt-1").pipe(
        Effect.exit,
        Effect.provide(layer)
      )
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(CheckoutCustomerJwtInvalid.name);
    }
  });

  it("maps WorkOS verifier runtime failures to checkout JWT verification failures", async () => {
    const layer = makeLayer(() =>
      Effect.fail(
        new WorkosAccessTokenVerificationFailure({
          message: "Failed to verify WorkOS access token",
        })
      )
    );

    const exit = await Effect.runPromise(
      CheckoutCustomerJwtVerifier.verify("jwt-1").pipe(
        Effect.exit,
        Effect.provide(layer)
      )
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        CheckoutCustomerJwtVerificationFailure.name
      );
    }
  });
});
