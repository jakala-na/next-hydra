import { Context, Effect, Layer } from "effect";

import type { CartSnapshot } from "../../domain/cart-snapshot";
import { CountryCode } from "../../domain/checkout";
import type {
  CheckoutBuyerContext,
  CheckoutDetails,
  CheckoutPolicyViolation,
} from "../../domain/checkout";

export interface EvaluateCheckoutPolicyInput {
  readonly cart: CartSnapshot;
  readonly details: CheckoutDetails;
  readonly buyerContext: CheckoutBuyerContext;
}

export interface CheckoutPolicy {
  readonly name: string;
  readonly evaluate: (
    input: EvaluateCheckoutPolicyInput
  ) => readonly CheckoutPolicyViolation[];
}

export const makeShippingCountryAvailabilityPolicy = (
  unavailableCountries: readonly CountryCode[]
): CheckoutPolicy => ({
  evaluate: ({ details }) => {
    const shippingCountry = details.deliveryDetails?.shippingAddress.country;

    if (shippingCountry === undefined) {
      return [];
    }

    if (!unavailableCountries.includes(shippingCountry)) {
      return [];
    }

    return [
      {
        code: "shipping.country.unavailable",
        message: `Shipping country ${shippingCountry} is configured as unavailable`,
        parameters: { country: shippingCountry },
        targets: [{ step: "shippingOptions", type: "checkoutStep" }],
      },
    ];
  },
  name: "shipping-country-availability",
});

export const shippingCountryAvailabilityPolicy =
  makeShippingCountryAvailabilityPolicy([CountryCode.make("RE")]);

export class CheckoutPolicies extends Context.Service<
  CheckoutPolicies,
  {
    readonly evaluate: (
      input: EvaluateCheckoutPolicyInput
    ) => Effect.Effect<readonly CheckoutPolicyViolation[]>;
  }
>()("@repo/commerce/checkout/CheckoutPolicies") {
  static readonly layerFrom = (policies: readonly CheckoutPolicy[]) =>
    Layer.succeed(
      CheckoutPolicies,
      CheckoutPolicies.of({
        evaluate: Effect.fn("CheckoutPolicies.evaluate")((input) =>
          Effect.sync(() =>
            policies.flatMap((policy) => policy.evaluate(input))
          )
        ),
      })
    );

  static readonly layer = CheckoutPolicies.layerFrom([
    shippingCountryAvailabilityPolicy,
  ]);

  static readonly layerEmpty = CheckoutPolicies.layerFrom([]);
}
