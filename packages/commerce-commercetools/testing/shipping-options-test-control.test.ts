import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { makeCommercetoolsShippingOptionsTestControl } from "./shipping-options-test-control";

const apiRootWithShippingMethods = (
  results: readonly {
    readonly name: string;
    readonly zoneRates: readonly {
      readonly shippingRates: readonly {
        readonly isMatching: boolean;
        readonly price: {
          readonly centAmount: number;
          readonly currencyCode: string;
        };
      }[];
    }[];
  }[]
) =>
  // SAFETY: The test control consumes only this matching-location request and
  // the response fields represented by the fixture.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
  ({
    shippingMethods: () => ({
      matchingLocation: () => ({
        get: () => ({
          execute: async () => await Promise.resolve({ body: { results } }),
        }),
      }),
    }),
  }) as unknown as ByProjectKeyRequestBuilder;

describe(makeCommercetoolsShippingOptionsTestControl, () => {
  it.effect(
    "confirms table rates through the provider test-control seam",
    () => {
      const control = makeCommercetoolsShippingOptionsTestControl(
        apiRootWithShippingMethods([
          {
            name: "Standard",
            zoneRates: [
              {
                shippingRates: [
                  {
                    isMatching: true,
                    price: { centAmount: 500, currencyCode: "USD" },
                  },
                ],
              },
            ],
          },
        ])
      );

      return control.expectShippingOptions({
        country: "US",
        options: [{ currency: "USD", name: "Standard", price: "5.00" }],
      });
    }
  );

  it.effect("reports a configured rate that differs from the scenario", () => {
    const control = makeCommercetoolsShippingOptionsTestControl(
      apiRootWithShippingMethods([
        {
          name: "Standard",
          zoneRates: [
            {
              shippingRates: [
                {
                  isMatching: true,
                  price: { centAmount: 700, currencyCode: "USD" },
                },
              ],
            },
          ],
        },
      ])
    );

    return Effect.gen(function* () {
      const failure = yield* control
        .expectShippingOptions({
          country: "US",
          options: [{ currency: "USD", name: "Standard", price: "5.00" }],
        })
        .pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: "ShippingOptionsTestControlFailure",
        operation: "expectShippingOptions",
        provider: "commercetools",
      });
      expect(failure.message).toContain("Expected Standard at 5.00 USD");
    });
  });
});
