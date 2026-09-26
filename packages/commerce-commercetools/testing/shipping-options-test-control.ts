import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { minorAmountFromDecimal } from "@repo/commerce/e2e/checkout-expectations";
import {
  ShippingOptionsTestControl,
  ShippingOptionsTestControlFailure,
} from "@repo/commerce/e2e/shipping-options-test-control";
import type { ShippingOptionsExpectation } from "@repo/commerce/e2e/shipping-options-test-control";
import { Effect, Layer } from "effect";

import { CommercetoolsRestClient } from "../client/rest-client";

const failure = (message: string, cause?: unknown) => {
  const fields = {
    message,
    operation: "expectShippingOptions",
    provider: "commercetools",
  } as const;
  return cause === undefined
    ? new ShippingOptionsTestControlFailure(fields)
    : new ShippingOptionsTestControlFailure({ ...fields, cause });
};

export const makeCommercetoolsShippingOptionsTestControl = (
  apiRoot: ByProjectKeyRequestBuilder
): ShippingOptionsTestControl["Service"] =>
  ShippingOptionsTestControl.of({
    expectShippingOptions: Effect.fn(
      "ShippingOptionsTestControl.expectShippingOptions"
    )(function* (input: ShippingOptionsExpectation) {
      const currencies = new Set(
        input.options.map((option) => option.currency)
      );
      const [currency] = currencies;
      if (currency === undefined || currencies.size !== 1) {
        return yield* failure(
          "Shipping Option expectations must use exactly one currency"
        );
      }

      const response = yield* Effect.tryPromise({
        catch: (cause) =>
          failure(
            `Failed to inspect Shipping Options for ${input.country}`,
            cause
          ),
        try: async () =>
          await apiRoot
            .shippingMethods()
            .matchingLocation()
            .get({ queryArgs: { country: input.country, currency } })
            .execute(),
      });
      const actual = new Map<string, string>();

      for (const method of response.body.results) {
        const matchingRates = method.zoneRates.flatMap((zoneRate) =>
          zoneRate.shippingRates.filter(
            (rate) => rate.isMatching && rate.price.currencyCode === currency
          )
        );
        const [rate] = matchingRates;
        if (rate === undefined || matchingRates.length !== 1) {
          return yield* failure(
            `Shipping Method ${method.name} did not have exactly one matching ${currency} rate`
          );
        }
        actual.set(method.name, String(rate.price.centAmount));
      }

      for (const option of input.options) {
        const expectedPrice = yield* Effect.try({
          catch: (cause) =>
            failure(
              `Shipping Option ${option.name} has an invalid expected price ${option.price}`,
              cause
            ),
          try: () => minorAmountFromDecimal(option.price),
        });
        if (actual.get(option.name) !== expectedPrice) {
          return yield* failure(
            `Expected ${option.name} at ${option.price} ${option.currency}, received ${actual.get(option.name) ?? "missing"} minor units`
          );
        }
      }
    }),
  });

export const shippingOptionsTestControlLayer = Layer.effect(
  ShippingOptionsTestControl,
  Effect.gen(function* () {
    const { apiRoot } = yield* CommercetoolsRestClient;
    return makeCommercetoolsShippingOptionsTestControl(apiRoot);
  })
);
