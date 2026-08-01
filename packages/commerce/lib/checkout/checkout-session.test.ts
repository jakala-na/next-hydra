import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import {
  CartId,
  LineItemId,
  ProductId,
  StoreKey,
  VariantId,
} from "../../domain/cart";
import { CartWriteConflict } from "../../domain/cart-errors";
import { type CartSnapshot, CartStore } from "../../domain/cart-snapshot";
import {
  CheckoutLocale,
  CountryCode,
  StorefrontAnonymousCheckoutScope,
} from "../../domain/checkout";
import {
  AnonymousCommercePrincipal,
  CommerceRequestContext,
} from "../../domain/commerce-request-context";
import { AddressBook } from "../../services/address-book";
import { CartPolicies } from "../../services/cart-policies";
import { Carts } from "../../services/carts";
import { CommerceAccounts } from "../../services/commerce-accounts";
import { CurrentCart } from "../../services/current-cart";
import type { CurrentCartRequest } from "../current-cart/request";
import { CheckoutPolicies } from "./checkout-policy";
import { CheckoutSession } from "./checkout-session";

const store = new CartStore({
  locale: CheckoutLocale.make("en-US"),
  storeKey: StoreKey.make("default-store"),
  currency: "USD",
});

const cart: CartSnapshot = {
  id: CartId.make("cart-1"),
  status: "active",
  storeKey: store.storeKey,
  lineItems: [
    {
      id: LineItemId.make("line-1"),
      variant: {
        id: VariantId.make("variant-1"),
        productId: ProductId.make("product-1"),
        name: "Hydra Wrench",
        images: [],
        attributes: {},
      },
      quantity: 1,
      unitPrice: { centAmount: 2500, currencyCode: "USD" },
      totalPrice: { centAmount: 2500, currencyCode: "USD" },
    },
  ],
  totalLineItemQuantity: 1,
  totalPrice: { centAmount: 2500, currencyCode: "USD" },
  checkoutDetails: {},
};

const scope = new StorefrontAnonymousCheckoutScope({
  channel: "storefrontAnonymous",
  locale: store.locale,
  anonymousCartId: cart.id,
});

const context = new CommerceRequestContext({
  locale: store.locale,
  principal: new AnonymousCommercePrincipal({ anonymousCartId: cart.id }),
});

const request: CurrentCartRequest = {
  _tag: "AnonymousCurrentCartRequest",
  store,
  possessedCartId: cart.id,
  establish: () => Effect.void,
  clear: () => Effect.void,
};

const provideCheckout = <A, E>(
  program: Effect.Effect<A, E, CheckoutSession>,
  carts = Carts.layerMemory({ carts: [cart] })
) => {
  const dependencies = Layer.mergeAll(
    carts,
    CartPolicies.layerEmpty,
    CheckoutPolicies.layerEmpty,
    CommerceAccounts.layerMemoryFrom({}),
    AddressBook.layerMemory()
  );
  const currentCart = CurrentCart.layer(request).pipe(
    Layer.provide(dependencies)
  );
  const checkoutSession = CheckoutSession.layer.pipe(
    Layer.provide(Layer.merge(dependencies, currentCart))
  );
  return program.pipe(Effect.provide(checkoutSession));
};

describe("CheckoutSession", () => {
  it.effect("builds Checkout state from the request-bound Current Cart", () =>
    provideCheckout(
      Effect.gen(function* () {
        const state = yield* CheckoutSession.getCurrent(scope);
        expect(state.cart).toEqual(cart);
        expect(state.activeStep).toBe("contact");
        expect("version" in state.cart).toBe(false);
      })
    )
  );

  it.effect("returns fresh Checkout state from a contact mutation", () =>
    provideCheckout(
      Effect.gen(function* () {
        const state = yield* CheckoutSession.saveContact({
          scope,
          cart: { id: cart.id },
          contact: {
            source: "manual",
            buyerContact: {
              email: " ada@example.com ",
              firstName: " Ada ",
              lastName: " Lovelace ",
            },
          },
        });
        expect(state.details.contact).toEqual({
          source: "manual",
          buyerContact: {
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        });
        expect(state.activeStep).toBe("deliveryDetails");
      })
    )
  );

  it.effect("preserves submitted Cart identity mismatch", () =>
    provideCheckout(
      Effect.flip(
        CheckoutSession.saveContact({
          scope,
          cart: { id: CartId.make("different-cart") },
          contact: {
            source: "manual",
            buyerContact: {
              email: "ada@example.com",
              firstName: "Ada",
              lastName: "Lovelace",
            },
          },
        })
      ).pipe(
        Effect.map((error) => expect(error._tag).toBe("CheckoutCartMismatch"))
      )
    )
  );

  it.effect(
    "maps an internal Cart write conflict to the public Checkout conflict",
    () =>
      provideCheckout(
        Effect.flip(
          CheckoutSession.saveContact({
            scope,
            cart: { id: cart.id },
            contact: {
              source: "manual",
              buyerContact: {
                email: "ada@example.com",
                firstName: "Ada",
                lastName: "Lovelace",
              },
            },
          })
        ).pipe(
          Effect.map((error) =>
            expect(error._tag).toBe("CheckoutVersionConflict")
          )
        ),
        Carts.layerMemory({
          carts: [cart],
          failures: {
            saveContact: new CartWriteConflict({
              cartId: cart.id,
              operation: "saveContact",
            }),
          },
        })
      )
  );

  it.effect(
    "returns fresh Checkout state from delivery details without rereading",
    () =>
      provideCheckout(
        Effect.gen(function* () {
          const result = yield* CheckoutSession.saveDeliveryDetails({
            context,
            cart: { id: cart.id },
            deliveryDetails: {
              type: "manual",
              saveToAddressBook: false,
              shippingAddress: {
                addressLine1: " 1 Hydra Way ",
                postalCode: " 10001 ",
                city: " New York ",
                country: CountryCode.make("US"),
              },
            },
          });
          expect(result.state.details.deliveryDetails).toMatchObject({
            source: "manual",
            shippingAddress: {
              addressLine1: "1 Hydra Way",
              postalCode: "10001",
              city: "New York",
            },
          });
        })
      )
  );
});
