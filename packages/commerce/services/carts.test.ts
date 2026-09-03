import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";

import { CountryCode } from "../domain/address";
import { CartId, LineItemId, ProductId, Sku, VariantId } from "../domain/cart";
import { CartProviderFailure } from "../domain/cart-errors";
import { ProductTypeKey } from "../domain/cart-snapshot";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../domain/commerce-account";
import { CommerceLocale, Store, StoreKey } from "../store";
import { Carts } from "./carts";

const store = new Store({
  currency: "USD",
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("us-store"),
});
const unitPriceCentAmount = 1250;
const initialQuantity = 2;
const updatedQuantity = 4;
const genericProductType = Schema.decodeSync(ProductTypeKey)("generic-product");

describe("Carts memory Layer", () => {
  it.effect("creates an anonymous Cart and makes it retrievable", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;

      const created = yield* carts.createAnonymous({ store });
      const found = yield* carts.findById({
        id: created.id,
        store,
      });

      expect(created.status).toBe("active");
      expect(created.storeKey).toBe(store.storeKey);
      expect(created.buyingContext).toBeUndefined();
      expect(Option.getOrThrow(found).id).toBe(created.id);
    }).pipe(Effect.provide(Carts.layerMemory()))
  );

  it.effect("returns confirmed absence without manufacturing a Cart", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const found = yield* carts.findById({
        id: CartId.make("missing-cart"),
        store,
      });

      expect(Option.isNone(found)).toBeTruthy();
    }).pipe(Effect.provide(Carts.layerMemory()))
  );

  it.effect("discovers the active Cart for a Business Unit", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const businessUnit = {
        businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
        businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
        customerId: CommerceCustomerId.make("customer-1"),
        store,
      };

      const created = yield* carts.createForBusinessUnit(businessUnit);
      const found = yield* carts.findActiveForBusinessUnit(businessUnit);

      expect(found.map((cart) => cart.id)).toStrictEqual([created.id]);
      expect(created.buyingContext?.businessUnitId).toBe(
        businessUnit.businessUnitId
      );
    }).pipe(Effect.provide(Carts.layerMemory()))
  );

  it.effect("adds purchasable merchandise and returns fresh Cart state", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const created = yield* carts.createAnonymous({ store });
      const updated = yield* carts.addItem({
        productId: ProductId.make("product-1"),
        quantity: initialQuantity,
        target: {
          _tag: "AnonymousCartTarget",
          id: created.id,
          store,
        },
        variantId: VariantId.make("variant-1"),
      });

      expect(updated).not.toBe(created);
      expect(updated.lineItems).toHaveLength(1);
      expect(updated.lineItems[0]?.variant.sku).toBe("SKU-1");
      expect(updated.totalLineItemQuantity).toBe(initialQuantity);
      expect(updated.totalPrice.centAmount).toBe(
        unitPriceCentAmount * initialQuantity
      );
    }).pipe(
      Effect.provide(
        Carts.layerMemory({
          merchandise: [
            {
              unitPrice: {
                centAmount: unitPriceCentAmount,
                currencyCode: "USD",
              },
              variant: {
                id: VariantId.make("variant-1"),
                images: [],
                name: "Hydra Wrench",
                productId: ProductId.make("product-1"),
                productType: genericProductType,
                sku: Sku.make("SKU-1"),
              },
            },
          ],
        })
      )
    )
  );

  it.effect("sets absolute quantity and removes the selected line", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const created = yield* carts.createAnonymous({ store });
      const target = {
        _tag: "AnonymousCartTarget" as const,
        id: created.id,
        store,
      };
      const added = yield* carts.addItem({
        productId: ProductId.make("product-1"),
        quantity: initialQuantity,
        target,
        variantId: VariantId.make("variant-1"),
      });
      const lineItemId = added.lineItems[0]?.id;

      if (lineItemId === undefined) {
        throw new Error("Expected memory Cart line item");
      }

      const changed = yield* carts.setLineItemQuantity({
        lineItemId,
        quantity: updatedQuantity,
        target,
      });
      const removed = yield* carts.removeLineItem({ lineItemId, target });

      expect(changed.lineItems[0]?.quantity).toBe(updatedQuantity);
      expect(changed.totalLineItemQuantity).toBe(updatedQuantity);
      expect(removed.lineItems).toStrictEqual([]);
      expect(removed.totalPrice.centAmount).toBe(0);
    }).pipe(
      Effect.provide(
        Carts.layerMemory({
          merchandise: [
            {
              unitPrice: {
                centAmount: unitPriceCentAmount,
                currencyCode: "USD",
              },
              variant: {
                id: VariantId.make("variant-1"),
                images: [],
                name: "Hydra Wrench",
                productId: ProductId.make("product-1"),
                productType: genericProductType,
                sku: Sku.make("SKU-1"),
              },
            },
          ],
        })
      )
    )
  );

  it.effect("saves canonical checkout contact and delivery details", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const created = yield* carts.createAnonymous({ store });
      const target = {
        _tag: "AnonymousCartTarget" as const,
        id: created.id,
        store,
      };
      const contact = {
        buyerContact: {
          email: "buyer@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
        source: "manual" as const,
      };
      const deliveryDetails = {
        shippingAddress: {
          addressLine1: "123 Example Street",
          city: "New York",
          country: CountryCode.make("US"),
          postalCode: "10001",
        },
        source: "manual" as const,
      };

      const withContact = yield* carts.saveContact({ contact, target });
      const withDelivery = yield* carts.saveDeliveryDetails({
        deliveryDetails,
        target,
      });

      expect(withContact.checkoutDetails.contact).toStrictEqual(contact);
      expect(withDelivery.checkoutDetails.contact).toStrictEqual(contact);
      expect(withDelivery.checkoutDetails.deliveryDetails).toStrictEqual(
        deliveryDetails
      );
    }).pipe(Effect.provide(Carts.layerMemory()))
  );

  it.effect("preserves missing-line and access-denied failures", () =>
    Effect.gen(function* () {
      const carts = yield* Carts;
      const created = yield* carts.createAnonymous({ store });
      const missingLine = yield* carts
        .removeLineItem({
          lineItemId: LineItemId.make("missing-line"),
          target: {
            _tag: "AnonymousCartTarget",
            id: created.id,
            store,
          },
        })
        .pipe(Effect.flip);
      const denied = yield* carts
        .saveContact({
          contact: {
            buyerContact: {
              email: "buyer@example.com",
              firstName: "Ada",
              lastName: "Lovelace",
            },
            source: "manual",
          },
          target: {
            _tag: "BusinessUnitCartTarget",
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            businessUnitKey: CommerceBusinessUnitKey.make(
              "business-unit-key-1"
            ),
            customerId: CommerceCustomerId.make("customer-1"),
            id: created.id,
            store,
          },
        })
        .pipe(Effect.flip);

      expect(missingLine._tag).toBe("CartLineItemNotFound");
      expect(denied._tag).toBe("CartAccessDenied");
    }).pipe(Effect.provide(Carts.layerMemory()))
  );

  it.effect(
    "injects stable provider failures without converting them to absence",
    () =>
      Effect.gen(function* () {
        const carts = yield* Carts;
        const error = yield* carts
          .findById({ id: CartId.make("cart-1"), store })
          .pipe(Effect.flip);

        expect(error._tag).toBe("CartProviderFailure");
        if (error._tag === "CartProviderFailure") {
          expect(error.reason).toBe("unavailable");
        }
      }).pipe(
        Effect.provide(
          Carts.layerMemory({
            failures: {
              findById: new CartProviderFailure({
                operation: "findById",
                reason: "unavailable",
              }),
            },
          })
        )
      )
  );
});
