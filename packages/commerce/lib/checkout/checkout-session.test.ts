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
import { CheckoutLocale, CountryCode } from "../../domain/checkout";
import { AnonymousCommerceContextRequest } from "../../domain/commerce-request-context";
import { AddressBook } from "../../services/address-book";
import { CartPolicies } from "../../services/cart-policies";
import { Carts } from "../../services/carts";
import { CommerceAccounts } from "../../services/commerce-accounts";
import { CommerceContext } from "../../services/commerce-context";
import { CurrentCart } from "../../services/current-cart";
import type { CurrentCartCookie } from "../current-cart/cookie";
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

const context = new AnonymousCommerceContextRequest({
  store,
  anonymousCartId: cart.id,
});

const currentCartCookie: CurrentCartCookie = {
  set: () => Effect.void,
  clear: () => Effect.void,
};

const provideCheckout = <A, E>(
  program: Effect.Effect<A, E, CheckoutSession>,
  carts = Carts.layerMemory({ carts: [cart] })
) => {
  const commerceAccounts = CommerceAccounts.layerMemoryFrom({});
  const dependencies = Layer.mergeAll(
    carts,
    CartPolicies.layerEmpty,
    CheckoutPolicies.layerEmpty,
    commerceAccounts
  );
  const commerceContext = CommerceContext.layer(context).pipe(
    Layer.provide(commerceAccounts)
  );
  const addressBook = AddressBook.layerMemory().pipe(
    Layer.provide(commerceContext)
  );
  const currentCart = CurrentCart.layer(currentCartCookie).pipe(
    Layer.provide(Layer.merge(dependencies, commerceContext))
  );
  const checkoutSession = CheckoutSession.layer.pipe(
    Layer.provide(
      Layer.mergeAll(dependencies, commerceContext, currentCart, addressBook)
    )
  );
  return program.pipe(Effect.provide(checkoutSession));
};

describe("CheckoutSession", () => {
  it.effect("builds Checkout state from the request-bound Current Cart", () =>
    provideCheckout(
      Effect.gen(function* () {
        const state = yield* CheckoutSession.getCurrent();
        expect(state.cart).toEqual(cart);
        expect(state.scope).toMatchObject({
          channel: "storefrontAnonymous",
          anonymousCartId: cart.id,
        });
        expect(state.activeStep).toBe("contact");
        expect("version" in state.cart).toBe(false);
      })
    )
  );

  it.effect("returns fresh Checkout state from a contact mutation", () =>
    provideCheckout(
      Effect.gen(function* () {
        const state = yield* CheckoutSession.saveContact({
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
