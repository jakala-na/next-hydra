import {
  type WorkosAccessTokenInvalid,
  type WorkosAccessTokenVerificationFailure,
  WorkosAccessTokenVerifier,
} from "@repo/auth/access-token";
import { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import { Effect, Layer } from "effect";
import {
  CheckoutCustomerJwtInvalid,
  CheckoutCustomerJwtVerificationFailure,
  CheckoutCustomerJwtVerifier,
} from "./customer-jwt";

const toCheckoutCustomerJwtError = (
  error: WorkosAccessTokenInvalid | WorkosAccessTokenVerificationFailure
) => {
  switch (error._tag) {
    case "WorkosAccessTokenInvalid":
      return new CheckoutCustomerJwtInvalid({
        message: error.message,
      });
    case "WorkosAccessTokenVerificationFailure":
      return new CheckoutCustomerJwtVerificationFailure({
        message: error.message,
        ...(error.cause === undefined ? {} : { cause: error.cause }),
      });
    default: {
      const exhaustiveError: never = error;
      return new CheckoutCustomerJwtVerificationFailure({
        cause: exhaustiveError,
        message: "Failed to verify checkout customer JWT",
      });
    }
  }
};

export const checkoutCustomerJwtVerifierLayerWorkos = Layer.effect(
  CheckoutCustomerJwtVerifier,
  Effect.gen(function* () {
    const workosVerifier = yield* WorkosAccessTokenVerifier;

    return CheckoutCustomerJwtVerifier.of({
      verify: (token) =>
        workosVerifier.verify(token).pipe(
          Effect.map((verifiedToken) =>
            AuthUserId.make(verifiedToken.authUserId)
          ),
          Effect.mapError(toCheckoutCustomerJwtError)
        ),
    });
  })
);
