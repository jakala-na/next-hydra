import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";

import {
  AddressBookReference,
  AddressBookWriteOutcomeUnknown,
} from "../../domain/address-book";
import { CartId, LineItemId, ProductId, VariantId } from "../../domain/cart";
import {
  CartWriteConflict,
  CartWriteOutcomeUnknown,
} from "../../domain/cart-errors";
import type { CartSnapshot } from "../../domain/cart-snapshot";
import { CountryCode } from "../../domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "../../domain/commerce-account";
import {
  AnonymousCommerceContextRequest,
  AuthUserId,
  CustomerCommerceContextRequest,
} from "../../domain/commerce-request-context";
import { AddressBook } from "../../services/address-book";
import { CartPolicies } from "../../services/cart-policies";
import { Carts } from "../../services/carts";
import { CommerceAccounts } from "../../services/commerce-accounts";
import { CommerceContext } from "../../services/commerce-context";
import { CurrentCart } from "../../services/current-cart";
import { CommerceLocale, Store, StoreKey } from "../../store";
import type { CurrentCartCookie } from "../current-cart/cookie";
import { CheckoutPolicies } from "./checkout-policy";
import { CheckoutSession } from "./checkout-session";

const store = new Store({
  locale: CommerceLocale.make("en-US"),
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
  carts = Carts.layerMemory({ carts: [cart] }),
  addressBookOverride?: Layer.Layer<AddressBook>
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
  const addressBook =
    addressBookOverride ??
    AddressBook.layerMemory().pipe(Layer.provide(commerceContext));
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

const provideCustomerCheckout = <A, E>(
  program: Effect.Effect<A, E, CheckoutSession>,
  profile: CommerceCustomerProfile
) => {
  const authUserId = AuthUserId.make("auth-user-1");
  const membership = new CommerceBusinessUnitMembership({
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
    businessUnitLabel: CommerceBusinessUnitLabel.make("Hydra Supply"),
  });
  const commerceAccounts = CommerceAccounts.layerMemoryFrom({
    businessUnitMemberships: [
      {
        customerId: profile.customerId,
        membership,
        storeKey: store.storeKey,
      },
    ],
    customerProfiles: [profile],
    customers: [{ authUserId, customerId: profile.customerId }],
  });
  const commerceContext = CommerceContext.layer(
    new CustomerCommerceContextRequest({ authUserId, store })
  ).pipe(Layer.provide(commerceAccounts));
  const customerCart: CartSnapshot = {
    ...cart,
    buyingContext: { businessUnitId: membership.businessUnitId },
  };
  const dependencies = Layer.mergeAll(
    Carts.layerMemory({ carts: [customerCart] }),
    CartPolicies.layerEmpty,
    CheckoutPolicies.layerEmpty,
    commerceAccounts
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

  it.effect(
    "reports the fields missing from an incomplete customer profile",
    () =>
      provideCustomerCheckout(
        CheckoutSession.saveContact({
          cart: { id: cart.id },
          contact: { source: "customerProfile" },
        }).pipe(
          Effect.flip,
          Effect.map((error) =>
            expect(error).toMatchObject({
              _tag: "CheckoutCustomerProfileIncomplete",
              missingFields: ["email"],
            })
          )
        ),
        new CommerceCustomerProfile({
          customerId: CommerceCustomerId.make("customer-1"),
          firstName: Redacted.make("Ada", { label: "personName" }),
          lastName: Redacted.make("Lovelace", { label: "personName" }),
        })
      )
  );

  it.effect(
    "allows Manual Contact after an incomplete customer profile",
    () =>
      provideCustomerCheckout(
        Effect.gen(function* () {
          const profileFailure = yield* CheckoutSession.saveContact({
            cart: { id: cart.id },
            contact: { source: "customerProfile" },
          }).pipe(Effect.flip);

          expect(profileFailure._tag).toBe(
            "CheckoutCustomerProfileIncomplete"
          );

          const state = yield* CheckoutSession.saveContact({
            cart: { id: cart.id },
            contact: {
              source: "manual",
              buyerContact: {
                email: "ada@example.com",
                firstName: "Ada",
                lastName: "Lovelace",
              },
            },
          });

          expect(state.details.contact).toMatchObject({
            source: "manual",
            buyerContact: {
              email: "ada@example.com",
              firstName: "Ada",
              lastName: "Lovelace",
            },
          });
        }),
        new CommerceCustomerProfile({
          customerId: CommerceCustomerId.make("customer-1"),
          firstName: Redacted.make("Ada", { label: "personName" }),
          lastName: Redacted.make("Lovelace", { label: "personName" }),
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

  it.effect("keeps an ambiguous Cart write in the typed Checkout channel", () =>
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
          expect(error).toMatchObject({
            _tag: "CheckoutMutationOutcomeUnknown",
            cartId: cart.id,
            operation: "saveContact",
          })
        )
      ),
      Carts.layerMemory({
        carts: [cart],
        failures: {
          saveContact: new CartWriteOutcomeUnknown({
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

  it.effect(
    "preserves the generated Address Book reference when saving is unconfirmed",
    () =>
      provideCheckout(
        CheckoutSession.saveDeliveryDetails({
          cart: { id: cart.id },
          deliveryDetails: {
            makeDefaultShipping: false,
            saveToAddressBook: true,
            shippingAddress: {
              addressLine1: "1 Hydra Way",
              city: "New York",
              country: CountryCode.make("US"),
              postalCode: "10001",
            },
            type: "manual",
          },
        }).pipe(
          Effect.flip,
          Effect.map((error) => {
            expect(error).toMatchObject({
              _tag: "CheckoutMutationOutcomeUnknown",
              operation: "saveDeliveryDetails",
            });
            if (error._tag !== "CheckoutMutationOutcomeUnknown") {
              throw new Error("Expected an unknown Checkout mutation outcome");
            }
            expect(error.addressBookReference).toBeDefined();
          })
        ),
        Carts.layerMemory({ carts: [cart] }),
        Layer.succeed(
          AddressBook,
          AddressBook.of({
            get: () => Effect.die("not used"),
            list: () => Effect.die("not used"),
            save: (input) =>
              Effect.fail(
                new AddressBookWriteOutcomeUnknown({
                  message: "Address Book save outcome is unknown",
                  reference: AddressBookReference.make(input.reference),
                })
              ),
          })
        )
      )
  );
});
