import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { vi } from "vitest";
import { CartId, ProductId, StoreKey, VariantId } from "../../../domain/cart";
import { CartStore } from "../../../domain/cart-snapshot";
import { CheckoutLocale } from "../../../domain/checkout";
import { Carts } from "../../../services/carts";
import type { Cart } from "../../types";
import { domainError, Err, Ok } from "../../utils/errors";
import {
  type CommercetoolsCartsPersistence,
  layerCommercetoolsCartsFrom,
} from "./carts";

vi.mock("server-only", () => ({}));
vi.mock("../../cart/cart.repo", () => ({ cartRepo: {} }));
vi.mock("../../store/store.service", () => ({ storeService: {} }));

const store = new CartStore({
  locale: CheckoutLocale.make("en-US"),
  storeKey: StoreKey.make("us-store"),
  currency: "USD",
});
const unitPriceCentAmount = 2500;
const currentVersion = 7;
const nextVersion = 8;
const updatedQuantity = 2;

const providerCart = ({
  id = "cart-1",
  quantity = 1,
  version = currentVersion,
}: {
  readonly id?: string;
  readonly quantity?: number;
  readonly version?: number;
} = {}): Cart => ({
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

describe("layerCommercetoolsCarts", () => {
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
    }).pipe(Effect.provide(layerCommercetoolsCartsFrom(persistence())))
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
      }).pipe(Effect.provide(layerCommercetoolsCartsFrom(implementation)));
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
        layerCommercetoolsCartsFrom(
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
        layerCommercetoolsCartsFrom(
          persistence({
            findById: async () => Ok({ ...providerCart(), store: null }),
          })
        )
      )
    )
  );
});
