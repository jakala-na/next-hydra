import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { CartId, ProductId, Sku, StoreKey, VariantId } from "../domain/cart";
import { CartPolicyFailure, CartProviderFailure } from "../domain/cart-errors";
import { type CartSnapshot, CartStore } from "../domain/cart-snapshot";
import { CheckoutLocale } from "../domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
} from "../domain/commerce-account";
import {
  AnonymousCommerceContextRequest,
  AuthUserId,
  CustomerCommerceContextRequest,
} from "../domain/commerce-request-context";
import type { CurrentCartCookie } from "../lib/current-cart/cookie";
import { CartPolicies } from "./cart-policies";
import { Carts } from "./carts";
import { CommerceAccounts } from "./commerce-accounts";
import { CommerceContext } from "./commerce-context";
import { CurrentCart } from "./current-cart";

const store = new CartStore({
  locale: CheckoutLocale.make("en-US"),
  storeKey: StoreKey.make("us-store"),
  currency: "USD",
});

const emptyCart = (id: string): CartSnapshot => ({
  id: CartId.make(id),
  status: "active",
  storeKey: store.storeKey,
  lineItems: [],
  totalLineItemQuantity: 0,
  totalPrice: { centAmount: 0, currencyCode: "USD" },
  checkoutDetails: {},
});

interface TestCurrentCartBoundary {
  readonly contextRequest:
    | AnonymousCommerceContextRequest
    | CustomerCommerceContextRequest;
  readonly currentCartCookie: CurrentCartCookie;
  readonly businessUnitId?: CommerceBusinessUnitId;
}

const anonymousRequest = ({
  anonymousCartId,
  setIds = [],
  cleared = [],
}: {
  readonly anonymousCartId?: CartId;
  readonly setIds?: CartId[];
  readonly cleared?: boolean[];
} = {}): TestCurrentCartBoundary => ({
  contextRequest: new AnonymousCommerceContextRequest({
    store,
    ...(anonymousCartId === undefined ? {} : { anonymousCartId }),
  }),
  currentCartCookie: {
    set: (id) => Effect.sync(() => setIds.push(id)).pipe(Effect.asVoid),
    clear: () => Effect.sync(() => cleared.push(true)).pipe(Effect.asVoid),
  },
});

const customerId = CommerceCustomerId.make("customer-1");
const authUserId = AuthUserId.make("auth-user-1");
const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");
const businessUnitMembership = new CommerceBusinessUnitMembership({
  businessUnitId,
  businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
  businessUnitLabel: CommerceBusinessUnitLabel.make("Business Unit One"),
});

const businessUnitRequest = (): TestCurrentCartBoundary => ({
  contextRequest: new CustomerCommerceContextRequest({ store, authUserId }),
  currentCartCookie: {
    set: () => Effect.void,
    clear: () => Effect.void,
  },
  businessUnitId,
});

const currentCartLayer = (
  request: TestCurrentCartBoundary,
  cartsLayer: Layer.Layer<Carts>,
  policiesLayer: Layer.Layer<CartPolicies> = CartPolicies.layerEmpty
) => {
  const commerceAccounts = CommerceAccounts.layerMemoryFrom({
    customers: [{ authUserId, customerId }],
    businessUnitMemberships: [
      {
        customerId,
        storeKey: store.storeKey,
        membership: businessUnitMembership,
      },
    ],
  });
  const commerceContext = CommerceContext.layer(request.contextRequest).pipe(
    Layer.provide(commerceAccounts)
  );

  return CurrentCart.layer(request.currentCartCookie).pipe(
    Layer.provide(Layer.mergeAll(cartsLayer, policiesLayer, commerceContext))
  );
};

describe("CurrentCart", () => {
  it.effect("reads ordinary absence without creating a Cart", () => {
    const setIds: CartId[] = [];
    return Effect.gen(function* () {
      const state = yield* CurrentCart.get();

      expect(Option.isNone(state)).toBe(true);
      expect(setIds).toEqual([]);
    }).pipe(
      Effect.provide(
        currentCartLayer(anonymousRequest({ setIds }), Carts.layerMemory())
      )
    );
  });

  it.effect("creates and sets an absent Cart only when adding", () => {
    const setIds: CartId[] = [];
    return Effect.gen(function* () {
      const state = yield* CurrentCart.addItem({
        productId: ProductId.make("product-1"),
        variantId: VariantId.make("variant-1"),
        quantity: 2,
      });
      const reread = Option.getOrThrow(yield* CurrentCart.get());

      expect(setIds).toEqual([state.cart.id]);
      expect(state.cart.totalLineItemQuantity).toBe(2);
      expect(reread.cart).toEqual(state.cart);
    }).pipe(
      Effect.provide(
        currentCartLayer(
          anonymousRequest({ setIds }),
          Carts.layerMemory({
            merchandise: [
              {
                variant: {
                  id: VariantId.make("variant-1"),
                  productId: ProductId.make("product-1"),
                  productType: "generic-product",
                  name: "Hydra Wrench",
                  sku: Sku.make("SKU-1"),
                  images: [],
                  attributes: {},
                },
                unitPrice: { centAmount: 1250, currencyCode: "USD" },
              },
            ],
          })
        )
      )
    );
  });

  it.effect("clears a confirmed missing anonymous Cart cookie", () => {
    const cleared: boolean[] = [];
    return Effect.gen(function* () {
      const currentCart = yield* CurrentCart;
      const state = yield* currentCart.get();

      expect(Option.isNone(state)).toBe(true);
      expect(cleared).toEqual([true]);
    }).pipe(
      Effect.provide(
        currentCartLayer(
          anonymousRequest({
            anonymousCartId: CartId.make("missing-cart"),
            cleared,
          }),
          Carts.layerMemory()
        )
      )
    );
  });

  it.effect("does not expose or replace an inaccessible possessed Cart", () => {
    const setIds: CartId[] = [];
    const cleared: boolean[] = [];
    const cart = {
      ...emptyCart("cart-1"),
      buyingContext: {
        businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
      },
    };
    return Effect.gen(function* () {
      const currentCart = yield* CurrentCart;
      const readError = yield* currentCart.get().pipe(Effect.flip);

      expect(readError).toMatchObject({
        _tag: "CartProviderFailure",
        operation: "findById",
        reason: "unexpectedResponse",
      });

      const error = yield* currentCart
        .addItem({
          productId: ProductId.make("product-1"),
          variantId: VariantId.make("variant-1"),
          quantity: 1,
        })
        .pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: "CartProviderFailure",
        operation: "findById",
        reason: "unexpectedResponse",
      });
      expect(setIds).toEqual([]);
      expect(cleared).toEqual([]);
    }).pipe(
      Effect.provide(
        currentCartLayer(
          anonymousRequest({
            anonymousCartId: cart.id,
            setIds,
            cleared,
          }),
          Carts.layerMemory({ carts: [cart] })
        )
      )
    );
  });

  it.effect("treats zero Business Unit candidates as ordinary absence", () =>
    Effect.gen(function* () {
      const currentCart = yield* CurrentCart;
      expect(Option.isNone(yield* currentCart.get())).toBe(true);
    }).pipe(
      Effect.provide(
        currentCartLayer(businessUnitRequest(), Carts.layerMemory())
      )
    )
  );

  it.effect("selects the single active Business Unit Cart", () => {
    const request = businessUnitRequest();
    const cart = {
      ...emptyCart("cart-1"),
      buyingContext: { businessUnitId },
    };
    return Effect.gen(function* () {
      const currentCart = yield* CurrentCart;
      const state = Option.getOrThrow(yield* currentCart.get());

      expect(state.cart.id).toBe(cart.id);
    }).pipe(
      Effect.provide(
        currentCartLayer(request, Carts.layerMemory({ carts: [cart] }))
      )
    );
  });

  it.effect(
    "fails selection when a Business Unit has multiple active Carts",
    () => {
      const request = businessUnitRequest();
      const carts = ["cart-1", "cart-2"].map((id) => ({
        ...emptyCart(id),
        buyingContext: { businessUnitId },
      }));

      return Effect.gen(function* () {
        const currentCart = yield* CurrentCart;
        const error = yield* currentCart.get().pipe(Effect.flip);

        expect(error._tag).toBe("CurrentCartSelectionConflict");
      }).pipe(
        Effect.provide(currentCartLayer(request, Carts.layerMemory({ carts })))
      );
    }
  );

  it.effect("evaluates Cart Policies for returned state", () =>
    Effect.gen(function* () {
      const currentCart = yield* CurrentCart;
      const state = Option.getOrThrow(yield* currentCart.get());

      expect(state.violations.map((violation) => violation.code)).toEqual([
        "cart.blocked",
      ]);
    }).pipe(
      Effect.provide(
        currentCartLayer(
          anonymousRequest({ anonymousCartId: CartId.make("cart-1") }),
          Carts.layerMemory({ carts: [emptyCart("cart-1")] }),
          CartPolicies.layerFrom([
            {
              name: "blocked",
              evaluate: () =>
                Effect.succeed([
                  {
                    code: "cart.blocked",
                    targets: [{ type: "cart" as const }],
                  },
                ]),
            },
          ])
        )
      )
    )
  );

  it.effect(
    "keeps Cart Policy execution failure distinct from violations",
    () =>
      Effect.gen(function* () {
        const currentCart = yield* CurrentCart;
        const error = yield* currentCart.get().pipe(Effect.flip);

        expect(error._tag).toBe("CartPolicyFailure");
      }).pipe(
        Effect.provide(
          currentCartLayer(
            anonymousRequest({ anonymousCartId: CartId.make("cart-1") }),
            Carts.layerMemory({ carts: [emptyCart("cart-1")] }),
            CartPolicies.layerFrom([
              {
                name: "broken",
                evaluate: () => Effect.fail(new CartPolicyFailure({})),
              },
            ])
          )
        )
      )
  );

  it.effect("sets a created Cart even when the later add fails", () => {
    const setIds: CartId[] = [];
    return Effect.gen(function* () {
      const currentCart = yield* CurrentCart;
      const error = yield* currentCart
        .addItem({
          productId: ProductId.make("product-1"),
          variantId: VariantId.make("variant-1"),
          quantity: 1,
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartProviderFailure");
      expect(setIds).toHaveLength(1);
    }).pipe(
      Effect.provide(
        currentCartLayer(
          anonymousRequest({ setIds }),
          Carts.layerMemory({
            failures: {
              addItem: new CartProviderFailure({
                operation: "addItem",
                reason: "unavailable",
              }),
            },
          })
        )
      )
    );
  });

  it.effect(
    "delegates Contact persistence even when the semantic projection matches",
    () => {
      const contact = {
        source: "manual" as const,
        buyerContact: {
          email: "buyer@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
      };
      const cart = {
        ...emptyCart("cart-1"),
        checkoutDetails: { contact },
      };

      return Effect.gen(function* () {
        const currentCart = yield* CurrentCart;
        const state = yield* currentCart.saveContact(contact);

        expect(state.cart.checkoutDetails.contact).toEqual(contact);
      }).pipe(
        Effect.provide(
          currentCartLayer(
            anonymousRequest({ anonymousCartId: cart.id }),
            Carts.layerMemory({
              carts: [cart],
            })
          )
        )
      );
    }
  );
});
