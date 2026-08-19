import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { CartId, ProductId, Sku, VariantId } from "../domain/cart";
import { CartPolicyFailure, CartProviderFailure } from "../domain/cart-errors";
import type { CartSnapshot } from "../domain/cart-snapshot";
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
import { CommerceLocale, Store, StoreKey } from "../store";
import { CartPolicies } from "./cart-policies";
import { Carts } from "./carts";
import { CommerceAccounts } from "./commerce-accounts";
import { CommerceContext } from "./commerce-context";
import { CurrentCart } from "./current-cart";

const store = new Store({
  currency: "USD",
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("us-store"),
});

const emptyCart = (id: string): CartSnapshot => ({
  checkoutDetails: {},
  id: CartId.make(id),
  lineItems: [],
  status: "active",
  storeKey: store.storeKey,
  totalLineItemQuantity: 0,
  totalPrice: { centAmount: 0, currencyCode: "USD" },
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
    clear: () => Effect.sync(() => cleared.push(true)).pipe(Effect.asVoid),
    set: (id) => Effect.sync(() => setIds.push(id)).pipe(Effect.asVoid),
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
  businessUnitId,
  contextRequest: new CustomerCommerceContextRequest({ authUserId, store }),
  currentCartCookie: {
    clear: () => Effect.void,
    set: () => Effect.void,
  },
});

const currentCartLayer = (
  request: TestCurrentCartBoundary,
  cartsLayer: Layer.Layer<Carts>,
  policiesLayer: Layer.Layer<CartPolicies> = CartPolicies.layerEmpty
) => {
  const commerceAccounts = CommerceAccounts.layerMemoryFrom({
    businessUnitMemberships: [
      {
        customerId,
        membership: businessUnitMembership,
        storeKey: store.storeKey,
      },
    ],
    customers: [{ authUserId, customerId }],
  });
  const commerceContext = CommerceContext.layer(request.contextRequest).pipe(
    Layer.provide(commerceAccounts)
  );

  return CurrentCart.layer(request.currentCartCookie).pipe(
    Layer.provide(Layer.mergeAll(cartsLayer, policiesLayer, commerceContext))
  );
};

describe(CurrentCart, () => {
  it.effect("reads ordinary absence without creating a Cart", () => {
    const setIds: CartId[] = [];
    return Effect.gen(function* () {
      const state = yield* CurrentCart.get();

      expect(Option.isNone(state)).toBeTruthy();
      expect(setIds).toStrictEqual([]);
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
        quantity: 2,
        variantId: VariantId.make("variant-1"),
      });
      const reread = Option.getOrThrow(yield* CurrentCart.get());

      expect(setIds).toStrictEqual([state.cart.id]);
      expect(state.cart.totalLineItemQuantity).toBe(2);
      expect(reread.cart).toStrictEqual(state.cart);
    }).pipe(
      Effect.provide(
        currentCartLayer(
          anonymousRequest({ setIds }),
          Carts.layerMemory({
            merchandise: [
              {
                unitPrice: { centAmount: 1250, currencyCode: "USD" },
                variant: {
                  attributes: {},
                  id: VariantId.make("variant-1"),
                  images: [],
                  name: "Hydra Wrench",
                  productId: ProductId.make("product-1"),
                  productType: "generic-product",
                  sku: Sku.make("SKU-1"),
                },
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

      expect(Option.isNone(state)).toBeTruthy();
      expect(cleared).toStrictEqual([true]);
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
          quantity: 1,
          variantId: VariantId.make("variant-1"),
        })
        .pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: "CartProviderFailure",
        operation: "findById",
        reason: "unexpectedResponse",
      });
      expect(setIds).toStrictEqual([]);
      expect(cleared).toStrictEqual([]);
    }).pipe(
      Effect.provide(
        currentCartLayer(
          anonymousRequest({
            anonymousCartId: cart.id,
            cleared,
            setIds,
          }),
          Carts.layerMemory({ carts: [cart] })
        )
      )
    );
  });

  it.effect("treats zero Business Unit candidates as ordinary absence", () =>
    Effect.gen(function* () {
      const currentCart = yield* CurrentCart;
      expect(Option.isNone(yield* currentCart.get())).toBeTruthy();
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

      expect(state.violations.map((violation) => violation.code)).toStrictEqual(
        ["cart.blocked"]
      );
    }).pipe(
      Effect.provide(
        currentCartLayer(
          anonymousRequest({ anonymousCartId: CartId.make("cart-1") }),
          Carts.layerMemory({ carts: [emptyCart("cart-1")] }),
          CartPolicies.layerFrom([
            {
              evaluate: () =>
                Effect.succeed([
                  {
                    code: "cart.blocked",
                    targets: [{ type: "cart" as const }],
                  },
                ]),
              name: "blocked",
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
                evaluate: () => Effect.fail(new CartPolicyFailure({})),
                name: "broken",
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
          quantity: 1,
          variantId: VariantId.make("variant-1"),
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
        buyerContact: {
          email: "buyer@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
        source: "manual" as const,
      };
      const cart = {
        ...emptyCart("cart-1"),
        checkoutDetails: { contact },
      };

      return Effect.gen(function* () {
        const currentCart = yield* CurrentCart;
        const state = yield* currentCart.saveContact(contact);

        expect(state.cart.checkoutDetails.contact).toStrictEqual(contact);
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
