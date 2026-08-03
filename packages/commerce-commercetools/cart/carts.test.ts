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
import { domainError, Err, Ok } from "@repo/commerce/lib/utils/errors";
import { Carts } from "@repo/commerce/services/carts";
import { CommerceLocale, Store, StoreKey } from "@repo/commerce/store";
import { Effect, Option } from "effect";
import { vi } from "vitest";
import { type CommercetoolsCartsPersistence, cartsLayerFrom } from "./carts";
import type { CommercetoolsCart } from "./provider-cart";

vi.mock("server-only", () => ({}));

const store = new Store({
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("us-store"),
  currency: "USD",
});
const unitPriceCentAmount = 2500;
const currentVersion = 7;
const nextVersion = 8;
const updatedQuantity = 2;
const persistedContactRead = 3;
const contact = {
  source: "manual" as const,
  buyerContact: {
    email: "buyer@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  },
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
  id,
  version,
  store: { key: "us-store" },
  lineItems: [
    {
      id: "line-1",
      productId: "product-1",
      productType: "heavy-lifting-and-specialized-equipment",
      name: "Hydra Crane",
      quantity,
      price: {
        value: { centAmount: unitPriceCentAmount, currencyCode: "USD" },
        discounted: null,
      },
      totalPrice: {
        centAmount: unitPriceCentAmount * quantity,
        currencyCode: "USD",
      },
      variant: {
        id: 3,
        sku: "SKU-3",
        images: [{ url: "https://example.com/crane.jpg", altText: "Crane" }],
        attributes: {
          capacity: 20,
          iso45001: true,
          mobility: { key: "mobile", label: "Mobile" },
          color: { key: "yellow", label: "Yellow" },
        },
      },
    },
  ],
  totalLineItemQuantity: quantity,
  totalPrice: {
    centAmount: unitPriceCentAmount * quantity,
    currencyCode: "USD",
  },
  checkoutDetails: {},
  cartState: "Active",
});

const persistence = (
  overrides: Partial<CommercetoolsCartsPersistence> = {}
): CommercetoolsCartsPersistence => ({
  findById: async () => Ok(providerCart()),
  findActiveForBusinessUnit: async () => Ok([]),
  createAnonymous: async () => Ok(providerCart()),
  createForBusinessUnit: async () => Ok(providerCart()),
  addItem: async () => Ok(providerCart()),
  setLineItemQuantity: async () => Ok(providerCart()),
  removeLineItem: async () => Ok(providerCart()),
  saveContact: async () => Ok(undefined),
  saveDeliveryDetails: async () => Ok(undefined),
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
        id: "3",
        productId: "product-1",
        productType: "heavy-lifting-and-specialized-equipment",
        name: "Hydra Crane",
        sku: "SKU-3",
        attributes: {
          capacity: 20,
          color: { key: "yellow", label: "Yellow" },
        },
      });
    }).pipe(Effect.provide(cartsLayerFrom(persistence())))
  );

  it.effect(
    "resolves the provider version before writing and returns fresh state",
    () => {
      let writtenVersion: number | undefined;
      const implementation = persistence({
        findById: async () => Ok(providerCart({ version: currentVersion })),
        addItem: ({ cart }) => {
          writtenVersion = cart.version;
          return Promise.resolve(
            Ok(
              providerCart({
                quantity: updatedQuantity,
                version: nextVersion,
              })
            )
          );
        },
      });

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const updated = yield* carts.addItem({
          target: {
            _tag: "AnonymousCartTarget",
            id: CartId.make("cart-1"),
            store,
          },
          productId: ProductId.make("product-1"),
          variantId: VariantId.make("3"),
          quantity: 1,
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
            findById: async () =>
              Err(domainError("NOT_FOUND", "Cart not found")),
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
            findById: async () =>
              Ok({ ...providerCart(), totalLineItemQuantity: -1 }),
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
              findById: async () =>
                Ok({
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
              findById: async () =>
                Ok({
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
        return Promise.resolve(
          Ok({
            ...providerCart(),
            checkoutDetails: { contact },
            customerEmail:
              reads === 1 ? "stale@example.com" : contact.buyerContact.email,
          })
        );
      },
      saveContact: () => {
        writes += 1;
        return Promise.resolve(Ok(undefined));
      },
    });

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const updated = yield* carts.saveContact({
        target: {
          _tag: "AnonymousCartTarget",
          id: CartId.make("cart-1"),
          store,
        },
        contact,
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
          return Promise.resolve(
            Ok({
              ...providerCart({
                version: reads === 1 ? currentVersion : nextVersion,
              }),
              ...(reads === 1
                ? {}
                : {
                    custom: {
                      type: { key: "orderCustomFields" },
                      fields: {},
                    },
                  }),
              ...(reads < persistedContactRead
                ? {}
                : {
                    checkoutDetails: { contact },
                    customerEmail: contact.buyerContact.email,
                  }),
            })
          );
        },
        saveContact: ({ retryConcurrentModification }) => {
          retryFlags.push(retryConcurrentModification);
          return Promise.resolve(
            retryFlags.length === 1
              ? Err(domainError("CONFLICT", "Concurrent modification"))
              : Ok(undefined)
          );
        },
      });

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const updated = yield* carts.saveContact({
          target: {
            _tag: "AnonymousCartTarget",
            id: CartId.make("cart-1"),
            store,
          },
          contact,
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
            target: {
              _tag: "AnonymousCartTarget",
              id: CartId.make("cart-1"),
              store,
            },
            contact,
          })
          .pipe(Effect.flip);

        expect(error._tag).toBe("CartWriteConflict");
      }).pipe(
        Effect.provide(
          cartsLayerFrom(
            persistence({
              saveContact: async () =>
                Err(domainError("CONFLICT", "Concurrent modification")),
            })
          )
        )
      )
  );

  it.effect("maps provider bad input to unavailable merchandise", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .addItem({
          target: {
            _tag: "AnonymousCartTarget",
            id: CartId.make("cart-1"),
            store,
          },
          productId: ProductId.make("product-1"),
          variantId: VariantId.make("3"),
          quantity: 1,
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartMerchandiseUnavailable");
    }).pipe(
      Effect.provide(
        cartsLayerFrom(
          persistence({
            addItem: async () =>
              Err(domainError("BAD_INPUT", "Variant is unavailable")),
          })
        )
      )
    )
  );

  it.effect(
    "maps a line disappearing during quantity change to line not found",
    () =>
      Effect.gen(function* () {
        const carts = yield* Carts;
        const error = yield* carts
          .setLineItemQuantity({
            target: {
              _tag: "AnonymousCartTarget",
              id: CartId.make("cart-1"),
              store,
            },
            lineItemId: LineItemId.make("line-1"),
            quantity: updatedQuantity,
          })
          .pipe(Effect.flip);

        expect(error._tag).toBe("CartLineItemNotFound");
      }).pipe(
        Effect.provide(
          cartsLayerFrom(
            persistence({
              setLineItemQuantity: async () =>
                Err(domainError("BAD_INPUT", "Line item no longer exists")),
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
            target: {
              _tag: "AnonymousCartTarget",
              id: CartId.make("cart-1"),
              store,
            },
            contact,
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
              saveContact: async () =>
                Err(
                  domainError(
                    "BAD_INPUT",
                    "Cart custom type cannot store checkout contact"
                  )
                ),
            })
          )
        )
      )
  );
});
