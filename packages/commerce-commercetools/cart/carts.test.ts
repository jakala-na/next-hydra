import { describe, expect, it } from "@effect/vitest";
import {
  CartId,
  LineItemId,
  ProductId,
  VariantId,
} from "@repo/commerce/domain/cart";
import {
  CommerceBusinessUnitId,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import { Carts } from "@repo/commerce/services/carts";
import { CommerceLocale, Store, StoreKey } from "@repo/commerce/store";
import { Effect, Option } from "effect";
import { vi } from "vitest";
import { type CommercetoolsCartsPersistence, cartsLayerFrom } from "./carts";
import {
  CommercetoolsCartCustomTypeConflict,
  CommercetoolsCartMerchandiseUnavailable,
  CommercetoolsCartNotFound,
  CommercetoolsCartVersionConflict,
  CommercetoolsCartWriteOutcomeUnknown,
} from "./persistence-errors";
import type { CommercetoolsCart } from "./provider-cart";

vi.mock("server-only", () => ({}));

const store = new Store({
  currency: "USD",
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("us-store"),
});
const unitPriceCentAmount = 2500;
const currentVersion = 7;
const nextVersion = 8;
const updatedQuantity = 2;
const persistedContactRead = 3;
const contact = {
  buyerContact: {
    email: "buyer@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  },
  source: "manual" as const,
};

const providerCart = ({
  id = "cart-1",
  quantity = 1,
  version = currentVersion,
}: {
  readonly id?: string;
  readonly quantity?: number;
  readonly version?: number;
} = {}): CommercetoolsCart => ({
  cartState: "Active",
  checkoutDetails: {},
  id,
  lineItems: [
    {
      id: "line-1",
      name: "Hydra Crane",
      price: {
        discounted: null,
        value: { centAmount: unitPriceCentAmount, currencyCode: "USD" },
      },
      productId: "product-1",
      productType: "heavy-lifting-and-specialized-equipment",
      quantity,
      totalPrice: {
        centAmount: unitPriceCentAmount * quantity,
        currencyCode: "USD",
      },
      variant: {
        attributes: {
          capacity: 20,
          color: { key: "yellow", label: "Yellow" },
          iso45001: true,
          mobility: { key: "mobile", label: "Mobile" },
        },
        id: 3,
        images: [{ altText: "Crane", url: "https://example.com/crane.jpg" }],
        sku: "SKU-3",
      },
    },
  ],
  store: { key: "us-store" },
  totalLineItemQuantity: quantity,
  totalPrice: {
    centAmount: unitPriceCentAmount * quantity,
    currencyCode: "USD",
  },
  version,
});

const persistence = (
  overrides: Partial<CommercetoolsCartsPersistence> = {}
): CommercetoolsCartsPersistence => ({
  addItem: () => Effect.succeed(providerCart()),
  createAnonymous: () => Effect.succeed(providerCart()),
  createForBusinessUnit: () => Effect.succeed(providerCart()),
  findActiveForBusinessUnit: () => Effect.succeed([]),
  findById: () => Effect.succeed(providerCart()),
  removeLineItem: () => Effect.succeed(providerCart()),
  saveContact: () => Effect.void,
  saveDeliveryDetails: () => Effect.void,
  setLineItemQuantity: () => Effect.succeed(providerCart()),
  ...overrides,
});

describe("cartsLayer", () => {
  it.effect("projects provider Cart data without leaking its version", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const found = yield* carts.findById({ id: CartId.make("cart-1"), store });
      const cart = Option.getOrThrow(found);

      expect(cart).not.toHaveProperty("version");
      expect(cart.lineItems[0]?.variant).toMatchObject({
        attributes: {
          capacity: 20,
          color: { key: "yellow", label: "Yellow" },
        },
        id: "3",
        name: "Hydra Crane",
        productId: "product-1",
        productType: "heavy-lifting-and-specialized-equipment",
        sku: "SKU-3",
      });
    }).pipe(Effect.provide(cartsLayerFrom(persistence())))
  );

  it.effect(
    "resolves the provider version before writing and returns fresh state",
    () => {
      let writtenVersion: number | undefined;
      const implementation = persistence({
        addItem: ({ cart }) => {
          writtenVersion = cart.version;
          return Effect.succeed(
            providerCart({
              quantity: updatedQuantity,
              version: nextVersion,
            })
          );
        },
        findById: () =>
          Effect.succeed(providerCart({ version: currentVersion })),
      });

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const updated = yield* carts.addItem({
          productId: ProductId.make("product-1"),
          quantity: 1,
          target: {
            _tag: "AnonymousCartTarget",
            id: CartId.make("cart-1"),
            store,
          },
          variantId: VariantId.make("3"),
        });

        expect(writtenVersion).toBe(currentVersion);
        expect(updated.totalLineItemQuantity).toBe(updatedQuantity);
        expect(updated).not.toHaveProperty("version");
      }).pipe(Effect.provide(cartsLayerFrom(implementation)));
    }
  );

  it.effect("distinguishes confirmed absence from provider failure", () =>
    Effect.gen(function* () {
      const missingCarts = yield* Carts;
      const missing = yield* missingCarts.findById({
        id: CartId.make("missing"),
        store,
      });
      expect(Option.isNone(missing)).toBe(true);
    }).pipe(
      Effect.provide(
        cartsLayerFrom(
          persistence({
            findById: () =>
              Effect.fail(new CommercetoolsCartNotFound({ cartId: "missing" })),
          })
        )
      )
    )
  );

  it.effect("reports invalid provider projections as invalid data", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .findById({ id: CartId.make("cart-1"), store })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartProviderFailure");
      if (error._tag === "CartProviderFailure") {
        expect(error.reason).toBe("invalidData");
      }
    }).pipe(
      Effect.provide(
        cartsLayerFrom(
          persistence({
            findById: () =>
              Effect.succeed({
                ...providerCart(),
                totalLineItemQuantity: -1,
              }),
          })
        )
      )
    )
  );

  it.effect(
    "rejects customer-owned Carts presented as anonymous possession",
    () =>
      Effect.gen(function* () {
        const carts = yield* Carts;
        const error = yield* carts
          .findById({ id: CartId.make("cart-1"), store })
          .pipe(Effect.flip);

        expect(error._tag).toBe("CartAccessDenied");
      }).pipe(
        Effect.provide(
          cartsLayerFrom(
            persistence({
              findById: () =>
                Effect.succeed({
                  ...providerCart(),
                  customerId: CommerceCustomerId.make("customer-1"),
                }),
            })
          )
        )
      )
  );

  it.effect(
    "rejects Business Unit Carts presented as anonymous possession",
    () =>
      Effect.gen(function* () {
        const carts = yield* Carts;
        const error = yield* carts
          .findById({ id: CartId.make("cart-1"), store })
          .pipe(Effect.flip);

        expect(error._tag).toBe("CartAccessDenied");
      }).pipe(
        Effect.provide(
          cartsLayerFrom(
            persistence({
              findById: () =>
                Effect.succeed({
                  ...providerCart(),
                  businessUnitId:
                    CommerceBusinessUnitId.make("business-unit-1"),
                }),
            })
          )
        )
      )
  );

  it.effect("repairs stale customer email when Contact already matches", () => {
    let writes = 0;
    let reads = 0;
    const implementation = persistence({
      findById: () => {
        reads += 1;
        return Effect.succeed({
          ...providerCart(),
          checkoutDetails: { contact },
          customerEmail:
            reads === 1 ? "stale@example.com" : contact.buyerContact.email,
        });
      },
      saveContact: () => {
        writes += 1;
        return Effect.void;
      },
    });

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const updated = yield* carts.saveContact({
        contact,
        target: {
          _tag: "AnonymousCartTarget",
          id: CartId.make("cart-1"),
          store,
        },
      });

      expect(writes).toBe(1);
      expect(updated.checkoutDetails.contact).toEqual(contact);
    }).pipe(Effect.provide(cartsLayerFrom(implementation)));
  });

  it.effect(
    "reloads and rebuilds Contact after a setCustomType conflict",
    () => {
      let reads = 0;
      const retryFlags: boolean[] = [];
      const implementation = persistence({
        findById: () => {
          reads += 1;
          return Effect.succeed({
            ...providerCart({
              version: reads === 1 ? currentVersion : nextVersion,
            }),
            ...(reads === 1
              ? {}
              : {
                  custom: {
                    fields: {},
                    type: { key: "orderCustomFields" },
                  },
                }),
            ...(reads < persistedContactRead
              ? {}
              : {
                  checkoutDetails: { contact },
                  customerEmail: contact.buyerContact.email,
                }),
          });
        },
        saveContact: ({ retryConcurrentModification }) => {
          retryFlags.push(retryConcurrentModification);
          return retryFlags.length === 1
            ? Effect.fail(
                new CommercetoolsCartVersionConflict({
                  cause: new Error("Concurrent modification"),
                })
              )
            : Effect.void;
        },
      });

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const updated = yield* carts.saveContact({
          contact,
          target: {
            _tag: "AnonymousCartTarget",
            id: CartId.make("cart-1"),
            store,
          },
        });

        expect(retryFlags).toEqual([true, false]);
        expect(updated.checkoutDetails.contact).toEqual(contact);
      }).pipe(Effect.provide(cartsLayerFrom(implementation)));
    }
  );

  it.effect(
    "returns a provider-neutral conflict after Contact recovery is exhausted",
    () =>
      Effect.gen(function* () {
        const carts = yield* Carts;
        const error = yield* carts
          .saveContact({
            contact,
            target: {
              _tag: "AnonymousCartTarget",
              id: CartId.make("cart-1"),
              store,
            },
          })
          .pipe(Effect.flip);

        expect(error._tag).toBe("CartWriteConflict");
      }).pipe(
        Effect.provide(
          cartsLayerFrom(
            persistence({
              saveContact: () =>
                Effect.fail(
                  new CommercetoolsCartVersionConflict({
                    cause: new Error("Concurrent modification"),
                  })
                ),
            })
          )
        )
      )
  );

  it.effect("maps provider-confirmed unavailable merchandise", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .addItem({
          productId: ProductId.make("product-1"),
          quantity: 1,
          target: {
            _tag: "AnonymousCartTarget",
            id: CartId.make("cart-1"),
            store,
          },
          variantId: VariantId.make("3"),
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartMerchandiseUnavailable");
    }).pipe(
      Effect.provide(
        cartsLayerFrom(
          persistence({
            addItem: () =>
              Effect.fail(
                new CommercetoolsCartMerchandiseUnavailable({
                  cause: new Error("Variant is unavailable"),
                })
              ),
          })
        )
      )
    )
  );

  it.effect("rejects a missing line before changing its quantity", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .setLineItemQuantity({
          lineItemId: LineItemId.make("line-1"),
          quantity: updatedQuantity,
          target: {
            _tag: "AnonymousCartTarget",
            id: CartId.make("cart-1"),
            store,
          },
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartLineItemNotFound");
    }).pipe(
      Effect.provide(
        cartsLayerFrom(
          persistence({
            findById: () =>
              Effect.succeed({ ...providerCart(), lineItems: [] }),
          })
        )
      )
    )
  );

  it.effect("preserves an unknown quantity-write outcome", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .setLineItemQuantity({
          lineItemId: LineItemId.make("line-1"),
          quantity: updatedQuantity,
          target: {
            _tag: "AnonymousCartTarget",
            id: CartId.make("cart-1"),
            store,
          },
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartWriteOutcomeUnknown");
    }).pipe(
      Effect.provide(
        cartsLayerFrom(
          persistence({
            setLineItemQuantity: () =>
              Effect.fail(
                new CommercetoolsCartWriteOutcomeUnknown({
                  cause: new Error("Connection closed after dispatch"),
                })
              ),
          })
        )
      )
    )
  );

  it.effect(
    "maps conflicting Contact custom type evidence to invalid data",
    () =>
      Effect.gen(function* () {
        const carts = yield* Carts;
        const error = yield* carts
          .saveContact({
            contact,
            target: {
              _tag: "AnonymousCartTarget",
              id: CartId.make("cart-1"),
              store,
            },
          })
          .pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: "CartProviderFailure",
          reason: "invalidData",
        });
      }).pipe(
        Effect.provide(
          cartsLayerFrom(
            persistence({
              saveContact: () =>
                Effect.fail(
                  new CommercetoolsCartCustomTypeConflict({
                    actualTypeKey: "otherCustomFields",
                    expectedTypeKey: "orderCustomFields",
                  })
                ),
            })
          )
        )
      )
  );
});
