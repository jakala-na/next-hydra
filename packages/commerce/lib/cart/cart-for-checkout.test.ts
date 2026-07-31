import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { decodeCartForCheckout } from "./cart-for-checkout";

const money = {
  centAmount: 2500,
  currencyCode: "USD",
} as const;

const cart = () => ({
  id: "cart-1",
  version: 7,
  anonymousId: "anon-1",
  lineItems: [
    {
      id: "line-1",
      productId: "product-1",
      name: "Hydra Wrench",
      quantity: 1,
      totalPrice: money,
      variant: {
        id: 1,
        sku: "HYDRA-WRENCH",
      },
    },
  ],
  totalLineItemQuantity: 1,
  totalPrice: money,
});

describe("decodeCartForCheckout", () => {
  it.effect(
    "decodes the provider Cart through the schema-backed checkout projection",
    () =>
      Effect.gen(function* () {
        const decoded = yield* decodeCartForCheckout({
          ...cart(),
          cartState: "Active",
          store: { key: "default-store" },
          businessUnitId: "business-unit-1",
        });

        expect(decoded).toMatchObject({
          id: "cart-1",
          businessUnitId: "business-unit-1",
          storeKey: "default-store",
          lineItems: [
            {
              id: "line-1",
              productId: "product-1",
              variant: {
                id: "1",
                sku: "HYDRA-WRENCH",
              },
            },
          ],
        });
        expect("cartState" in decoded).toBe(false);
      })
  );

  it.effect("rejects empty provider Cart identifiers", () =>
    Effect.gen(function* () {
      const exit = yield* decodeCartForCheckout({
        ...cart(),
        id: "",
      }).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
    })
  );
});
