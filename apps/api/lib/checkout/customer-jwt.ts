import type { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import { Context, Effect, Layer, Schema } from "effect";

export class CheckoutCustomerJwtInvalid extends Schema.TaggedErrorClass<CheckoutCustomerJwtInvalid>()(
  "CheckoutCustomerJwtInvalid",
  {
    message: Schema.String,
  }
) {}

export class CheckoutCustomerJwtVerificationFailure extends Schema.TaggedErrorClass<CheckoutCustomerJwtVerificationFailure>()(
  "CheckoutCustomerJwtVerificationFailure",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class CheckoutCustomerJwtVerifier extends Context.Service<
  CheckoutCustomerJwtVerifier,
  {
    readonly verify: (
      token: string
    ) => Effect.Effect<
      AuthUserId,
      CheckoutCustomerJwtInvalid | CheckoutCustomerJwtVerificationFailure
    >;
  }
>()("@repo/api/checkout/CheckoutCustomerJwtVerifier") {
  static readonly verify = Effect.fn("CheckoutCustomerJwtVerifier.verify")(
    (token: string) =>
      Effect.flatMap(CheckoutCustomerJwtVerifier, (verifier) =>
        verifier.verify(token)
      )
  );

  static readonly layerNotConfigured = Layer.succeed(
    CheckoutCustomerJwtVerifier,
    CheckoutCustomerJwtVerifier.of({
      verify: () =>
        Effect.fail(
          new CheckoutCustomerJwtInvalid({
            message: "Checkout customer JWT verification is not configured",
          })
        ),
    })
  );
}
