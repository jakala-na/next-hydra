import { describe, expect, it } from "@effect/vitest";
import {
  CheckoutPayments,
  PaymentConfirmationReference,
  PaymentProviderReference,
  PaymentReference,
} from "@repo/payments";
import { Effect, Layer, Redacted } from "effect";

import {
  AddressBookEntry,
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
import {
  DeliveryGroupReference,
  DeliveryPlanReference,
  DeliveryPlanQuoteReference,
  ShippingOptionReference,
} from "../../domain/delivery-plan";
import type { DeliveryPlanQuote } from "../../domain/delivery-plan";
import { AddressBook } from "../../services/address-book";
import { CartPolicies } from "../../services/cart-policies";
import { Carts } from "../../services/carts";
import { CommerceAccounts } from "../../services/commerce-accounts";
import { CommerceContext } from "../../services/commerce-context";
import { CurrentCart } from "../../services/current-cart";
import {
  DeliveryPlanning,
  DeliveryPlanningProviderFailure,
} from "../../services/delivery-planning";
import { CommerceLocale, Store, StoreKey } from "../../store";
import type { CurrentCartCookie } from "../current-cart/cookie";
import { CheckoutPolicies } from "./checkout-policy";
import { CheckoutSession } from "./checkout-session";

const store = new Store({
  currency: "USD",
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("default-store"),
});

const cart: CartSnapshot = {
  checkoutDetails: {},
  id: CartId.make("cart-1"),
  lineItems: [
    {
      id: LineItemId.make("line-1"),
      quantity: 1,
      totalPrice: { centAmount: 2500, currencyCode: "USD" },
      unitPrice: { centAmount: 2500, currencyCode: "USD" },
      variant: {
        attributes: {},
        id: VariantId.make("variant-1"),
        images: [],
        name: "Hydra Wrench",
        productId: ProductId.make("product-1"),
      },
    },
  ],
  status: "active",
  storeKey: store.storeKey,
  totalLineItemQuantity: 1,
  totalPrice: { centAmount: 2500, currencyCode: "USD" },
};

const context = new AnonymousCommerceContextRequest({
  anonymousCartId: cart.id,
  store,
});

const currentCartCookie: CurrentCartCookie = {
  clear: () => Effect.void,
  set: () => Effect.void,
};

const provideCheckout = <A, E>(
  program: Effect.Effect<A, E, CheckoutSession>,
  carts = Carts.layerMemory({ carts: [cart] }),
  addressBookOverride?: Layer.Layer<AddressBook>,
  deliveryPlanningOverride = DeliveryPlanning.emptyLayer,
  checkoutPaymentsOverride = CheckoutPayments.unavailableLayer
) => {
  const commerceAccounts = CommerceAccounts.layerMemoryFrom({});
  const dependencies = Layer.mergeAll(
    carts,
    CartPolicies.layerEmpty,
    CheckoutPolicies.layerEmpty,
    CheckoutPayments.unavailableLayer,
    commerceAccounts,
    checkoutPaymentsOverride,
    deliveryPlanningOverride
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
    roles: ["admin", "buyer"],
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
    CheckoutPayments.unavailableLayer,
    commerceAccounts,
    DeliveryPlanning.emptyLayer
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

describe(CheckoutSession, () => {
  it.effect("builds Checkout state from the request-bound Current Cart", () =>
    provideCheckout(
      Effect.gen(function* () {
        const state = yield* CheckoutSession.getCurrent();
        expect(state.cart).toStrictEqual(cart);
        expect(state.scope).toMatchObject({
          anonymousCartId: cart.id,
          channel: "storefrontAnonymous",
        });
        expect(state.activeStep).toBe("contact");
        expect("version" in state.cart).toBeFalsy();
      })
    )
  );

  it.effect("returns fresh Checkout state from a contact mutation", () =>
    provideCheckout(
      Effect.gen(function* () {
        const state = yield* CheckoutSession.saveContact({
          cart: { id: cart.id },
          contact: {
            buyerContact: {
              email: " ada@example.com ",
              firstName: " Ada ",
              lastName: " Lovelace ",
            },
            source: "manual",
          },
        });
        expect(state.details.contact).toStrictEqual({
          buyerContact: {
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
          source: "manual",
        });
        expect(state.activeStep).toBe("deliveryDetails");
      })
    )
  );

  it.effect("rejects a selection from an older Delivery Plan quote", () => {
    const shippingAddress = {
      addressLine1: "1 Hydra Way",
      city: "New York",
      country: CountryCode.make("US"),
      postalCode: "10001",
    };
    const checkoutReadyCart: CartSnapshot = {
      ...cart,
      checkoutDetails: {
        contact: {
          buyerContact: {
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
          source: "manual",
        },
        deliveryDetails: { shippingAddress, source: "manual" },
      },
    };
    const planReference = DeliveryPlanReference.make("plan-1");
    const groupReference = DeliveryGroupReference.make("delivery-1");
    const optionReference = ShippingOptionReference.make("standard");
    const quote = {
      plans: [
        {
          groups: [
            {
              reference: groupReference,
              shippingAddress,
              shippingOptions: [
                {
                  name: "Standard",
                  price: { centAmount: 500, currencyCode: "USD" },
                  reference: optionReference,
                },
              ],
              targets: [{ lineItemId: LineItemId.make("line-1"), quantity: 1 }],
            },
          ],
          reference: planReference,
        },
      ],
      reference: DeliveryPlanQuoteReference.make("quote-current"),
    } as const satisfies DeliveryPlanQuote;

    return provideCheckout(
      CheckoutSession.saveShippingOptions({
        cart: { id: cart.id },
        selection: {
          groups: [
            {
              deliveryGroupReference: groupReference,
              shippingOptionReference: optionReference,
            },
          ],
          quoteReference: DeliveryPlanQuoteReference.make("quote-stale"),
          reference: planReference,
        },
      }).pipe(
        Effect.flip,
        Effect.map((error) => {
          expect(error).toMatchObject({
            _tag: "CheckoutShippingSelectionUnavailable",
            quoteReference: "quote-stale",
          });
          return error;
        })
      ),
      Carts.layerMemory({ carts: [checkoutReadyCart] }),
      undefined,
      DeliveryPlanning.layerMemory(() => Effect.succeed(quote))
    );
  });

  it.effect(
    "requires refresh instead of retry when saving succeeds but re-quoting fails",
    () => {
      const shippingAddress = {
        addressLine1: "1 Hydra Way",
        city: "New York",
        country: CountryCode.make("US"),
        postalCode: "10001",
      };
      const checkoutReadyCart: CartSnapshot = {
        ...cart,
        checkoutDetails: {
          contact: {
            buyerContact: {
              email: "ada@example.com",
              firstName: "Ada",
              lastName: "Lovelace",
            },
            source: "manual",
          },
          deliveryDetails: { shippingAddress, source: "manual" },
        },
      };
      const planReference = DeliveryPlanReference.make("plan-1");
      const groupReference = DeliveryGroupReference.make("delivery-1");
      const optionReference = ShippingOptionReference.make("standard");
      const quoteReference = DeliveryPlanQuoteReference.make("quote-1");
      const quote = {
        plans: [
          {
            groups: [
              {
                reference: groupReference,
                shippingAddress,
                shippingOptions: [
                  {
                    name: "Standard",
                    price: { centAmount: 500, currencyCode: "USD" },
                    reference: optionReference,
                  },
                ],
                targets: [
                  { lineItemId: LineItemId.make("line-1"), quantity: 1 },
                ],
              },
            ],
            reference: planReference,
          },
        ],
        reference: quoteReference,
      } as const satisfies DeliveryPlanQuote;
      let quoteCalls = 0;

      return provideCheckout(
        CheckoutSession.saveShippingOptions({
          cart: { id: cart.id },
          selection: {
            groups: [
              {
                deliveryGroupReference: groupReference,
                shippingOptionReference: optionReference,
              },
            ],
            quoteReference,
            reference: planReference,
          },
        }).pipe(
          Effect.flip,
          Effect.map((error) => {
            expect(error).toMatchObject({
              _tag: "CheckoutShippingOptionsRefreshRequired",
              cartId: cart.id,
            });
            return error;
          })
        ),
        Carts.layerMemory({ carts: [checkoutReadyCart] }),
        undefined,
        DeliveryPlanning.layerMemory(() => {
          quoteCalls += 1;
          return quoteCalls === 1
            ? Effect.succeed(quote)
            : Effect.fail(
                new DeliveryPlanningProviderFailure({
                  operation: "quote",
                  reason: "unavailable",
                })
              );
        })
      );
    }
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
          Effect.map((error) => {
            expect(error).toMatchObject({
              _tag: "CheckoutCustomerProfileIncomplete",
              missingFields: ["email"],
            });
            return error;
          })
        ),
        new CommerceCustomerProfile({
          customerId: CommerceCustomerId.make("customer-1"),
          firstName: Redacted.make("Ada", { label: "personName" }),
          lastName: Redacted.make("Lovelace", { label: "personName" }),
        })
      )
  );

  it.effect("allows Manual Contact after an incomplete customer profile", () =>
    provideCustomerCheckout(
      Effect.gen(function* () {
        const profileFailure = yield* CheckoutSession.saveContact({
          cart: { id: cart.id },
          contact: { source: "customerProfile" },
        }).pipe(Effect.flip);

        expect(profileFailure._tag).toBe("CheckoutCustomerProfileIncomplete");

        const state = yield* CheckoutSession.saveContact({
          cart: { id: cart.id },
          contact: {
            buyerContact: {
              email: "ada@example.com",
              firstName: "Ada",
              lastName: "Lovelace",
            },
            source: "manual",
          },
        });

        expect(state.details.contact).toMatchObject({
          buyerContact: {
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
          source: "manual",
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
            buyerContact: {
              email: "ada@example.com",
              firstName: "Ada",
              lastName: "Lovelace",
            },
            source: "manual",
          },
        })
      ).pipe(
        Effect.map((error) => {
          expect(error._tag).toBe("CheckoutCartMismatch");
          return error;
        })
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
              buyerContact: {
                email: "ada@example.com",
                firstName: "Ada",
                lastName: "Lovelace",
              },
              source: "manual",
            },
          })
        ).pipe(
          Effect.map((error) => {
            expect(error._tag).toBe("CheckoutVersionConflict");
            return error;
          })
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
            buyerContact: {
              email: "ada@example.com",
              firstName: "Ada",
              lastName: "Lovelace",
            },
            source: "manual",
          },
        })
      ).pipe(
        Effect.map((error) => {
          expect(error).toMatchObject({
            _tag: "CheckoutMutationOutcomeUnknown",
            cartId: cart.id,
            operation: "saveContact",
          });
          return error;
        })
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
              saveToAddressBook: false,
              shippingAddress: {
                addressLine1: " 1 Hydra Way ",
                city: " New York ",
                country: CountryCode.make("US"),
                postalCode: " 10001 ",
              },
              type: "manual",
            },
          });
          expect(result.state.details.deliveryDetails).toMatchObject({
            shippingAddress: {
              addressLine1: "1 Hydra Way",
              city: "New York",
              postalCode: "10001",
            },
            source: "manual",
          });
        })
      )
  );

  it.effect(
    "re-quotes and advances to Payment after saving every Delivery Group selection",
    () => {
      const shippingAddress = {
        addressLine1: "1 Hydra Way",
        city: "New York",
        country: CountryCode.make("US"),
        postalCode: "10001",
      };
      const checkoutReadyCart: CartSnapshot = {
        ...cart,
        checkoutDetails: {
          contact: {
            buyerContact: {
              email: "ada@example.com",
              firstName: "Ada",
              lastName: "Lovelace",
            },
            source: "manual",
          },
          deliveryDetails: { shippingAddress, source: "manual" },
        },
      };
      const planReference = DeliveryPlanReference.make("plan-1");
      const groupReference = DeliveryGroupReference.make("delivery-1");
      const optionReference = ShippingOptionReference.make("standard");
      const quoteReference = DeliveryPlanQuoteReference.make("quote-1");
      const quote = {
        plans: [
          {
            groups: [
              {
                reference: groupReference,
                shippingAddress,
                shippingOptions: [
                  {
                    name: "Standard",
                    price: { centAmount: 500, currencyCode: "USD" },
                    reference: optionReference,
                  },
                ],
                targets: [
                  { lineItemId: LineItemId.make("line-1"), quantity: 1 },
                ],
              },
            ],
            reference: planReference,
          },
        ],
        reference: quoteReference,
      } as const satisfies DeliveryPlanQuote;

      return provideCheckout(
        Effect.gen(function* () {
          const before = yield* CheckoutSession.getCurrentWithDeliveryPlans();
          expect(before.state.activeStep).toBe("shippingOptions");

          const state = yield* CheckoutSession.saveShippingOptions({
            cart: { id: cart.id },
            selection: {
              groups: [
                {
                  deliveryGroupReference: groupReference,
                  shippingOptionReference: optionReference,
                },
              ],
              quoteReference,
              reference: planReference,
            },
          });

          expect(state.activeStep).toBe("paymentOptions");
          expect(
            state.steps.find((step) => step.id === "shippingOptions")?.status
          ).toBe("complete");
          expect(
            state.details.selectedDeliveryPlan?.groups[0].selectedShippingOption
          ).toStrictEqual(quote.plans[0].groups[0].shippingOptions[0]);
        }),
        Carts.layerMemory({ carts: [checkoutReadyCart] }),
        undefined,
        DeliveryPlanning.layerMemory(() => Effect.succeed(quote))
      );
    }
  );

  it.effect(
    "preserves the saved Address Book reference when post-write re-quoting fails",
    () => {
      let savedEntry: AddressBookEntry | undefined;
      let saveCalls = 0;
      let quoteCalls = 0;
      const addressBook = Layer.succeed(
        AddressBook,
        AddressBook.of({
          get: () =>
            savedEntry === undefined
              ? Effect.die("Address Book entry was not saved")
              : Effect.succeed(savedEntry),
          list: () =>
            Effect.succeed(savedEntry === undefined ? [] : [savedEntry]),
          save: (input) => {
            saveCalls += 1;
            savedEntry = new AddressBookEntry(input);
            return Effect.succeed(savedEntry);
          },
        })
      );
      const deliveryPlanning = DeliveryPlanning.layerMemory(() => {
        quoteCalls += 1;
        return quoteCalls === 2
          ? Effect.fail(
              new DeliveryPlanningProviderFailure({
                operation: "quote",
                reason: "unavailable",
              })
            )
          : Effect.succeed({
              plans: [],
              reference: DeliveryPlanQuoteReference.make(`quote-${quoteCalls}`),
            });
      });

      return provideCheckout(
        Effect.gen(function* () {
          const error = yield* CheckoutSession.saveDeliveryDetails({
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
          }).pipe(Effect.flip);

          expect(error).toMatchObject({
            _tag: "CheckoutMutationProviderFailure",
            operation: "checkout.deliveryPlanning.quote",
          });
          if (
            error._tag !== "CheckoutMutationProviderFailure" ||
            error.addressBookReference === undefined
          ) {
            throw new Error("Expected the saved Address Book reference");
          }

          yield* CheckoutSession.saveDeliveryDetails({
            cart: { id: cart.id },
            deliveryDetails: {
              addressBookReference: error.addressBookReference,
              type: "addressBook",
            },
          });

          expect(saveCalls).toBe(1);
        }),
        Carts.layerMemory({ carts: [cart] }),
        addressBook,
        deliveryPlanning
      );
    }
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
            return error;
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

  it.effect(
    "does not prepare Payment Options before current Shipping Options are complete",
    () => {
      const shippingAddress = {
        addressLine1: "1 Payment Way",
        city: "New York",
        country: CountryCode.make("US"),
        postalCode: "10001",
      };
      const cartBeforeShipping: CartSnapshot = {
        ...cart,
        checkoutDetails: {
          contact: {
            buyerContact: {
              email: "payment@example.com",
              firstName: "Payment",
              lastName: "Buyer",
            },
            source: "manual",
          },
          deliveryDetails: { shippingAddress, source: "manual" },
        },
      };

      return provideCheckout(
        CheckoutSession.preparePaymentOptions().pipe(
          Effect.flip,
          Effect.map((failure) => {
            expect(failure).toMatchObject({
              _tag: "CheckoutPaymentOptionsUnavailable",
              reason: "shippingOptionsIncomplete",
            });
            return failure;
          })
        ),
        Carts.layerMemory({ carts: [cartBeforeShipping] })
      );
    }
  );

  it.effect(
    "prepares and saves the parameterized Card payment before Review without authorization",
    () => {
      const shippingAddress = {
        addressLine1: "1 Payment Way",
        city: "New York",
        country: CountryCode.make("US"),
        postalCode: "10001",
      };
      const quoteReference = DeliveryPlanQuoteReference.make("quote-payment");
      const planReference = DeliveryPlanReference.make("plan-payment");
      const groupReference = DeliveryGroupReference.make("group-payment");
      const optionReference = ShippingOptionReference.make("option-payment");
      const selectedDeliveryPlan = {
        groups: [
          {
            reference: groupReference,
            selectedShippingOption: {
              name: "Parameterized Shipping",
              price: { centAmount: 500, currencyCode: "USD" },
              reference: optionReference,
            },
            shippingAddress,
            targets: [{ lineItemId: LineItemId.make("line-1"), quantity: 1 }],
          },
        ],
        quoteReference,
        reference: planReference,
      } as const;
      const readyCart: CartSnapshot = {
        ...cart,
        checkoutDetails: {
          contact: {
            buyerContact: {
              email: "payment@example.com",
              firstName: "Payment",
              lastName: "Buyer",
            },
            source: "manual",
          },
          deliveryDetails: { shippingAddress, source: "manual" },
          selectedDeliveryPlan,
        },
        totalPrice: { centAmount: 3000, currencyCode: "USD" },
      };
      const quote = {
        plans: [
          {
            groups: [
              {
                reference: groupReference,
                shippingAddress,
                shippingOptions: [
                  selectedDeliveryPlan.groups[0].selectedShippingOption,
                ],
                targets: selectedDeliveryPlan.groups[0].targets,
              },
            ],
            reference: planReference,
          },
        ],
        reference: quoteReference,
      } as const satisfies DeliveryPlanQuote;
      const paymentReference = PaymentReference.make("payment-from-input");
      const confirmationReference = PaymentConfirmationReference.make(
        "confirmation-from-input"
      );
      const publicConfiguration = "public-configuration-from-input";
      const clientToken = "client-token-from-input";
      const payments = CheckoutPayments.layerMemory({
        card: {
          clientTokenFor: () => clientToken,
          confirmationAvailabilityFor: ({
            confirmationReference: submittedConfirmationReference,
          }) => {
            expect(submittedConfirmationReference).toBe(confirmationReference);
            return "available";
          },
          provider: "Memory Card Provider",
          providerReferenceFor: () =>
            PaymentProviderReference.make("provider-from-input"),
          publicConfiguration,
        },
        cardPaymentReferenceFor: () => paymentReference,
        creditProfiles: [],
        netTermsPaymentReferenceFor: () =>
          PaymentReference.make("unused-net-terms-payment"),
      });

      return provideCheckout(
        Effect.gen(function* () {
          const prepared = yield* CheckoutSession.preparePaymentOptions();
          const card = prepared.paymentOptions.methods.find(
            (method) => method.method === "card"
          );
          if (card === undefined) {
            return yield* Effect.die("Expected Card preparation input");
          }
          const { preparationReference } = card.input;
          expect(preparationReference.length).toBeGreaterThan(0);
          expect(prepared.deliveryPlanQuote).toStrictEqual(quote);
          expect(prepared.paymentOptions).toStrictEqual({
            amount: readyCart.totalPrice,
            methods: [
              {
                availability: "available",
                displayName: "Card",
                input: {
                  clientIntegration: {
                    clientToken,
                    provider: "Memory Card Provider",
                    publicConfiguration,
                  },
                  preparationReference,
                },
                method: "card",
              },
            ],
          });

          const state = yield* CheckoutSession.savePaymentOptions({
            cart: { id: readyCart.id },
            selection: {
              billingAddress: { source: "shippingAddress" },
              payment: {
                confirmationReference,
                method: "card",
                preparationReference,
              },
            },
          });

          expect(state.activeStep).toBe("reviewOrder");
          expect(state.details.preparedPayment).toStrictEqual({
            amount: readyCart.totalPrice,
            billingAddress: shippingAddress,
            confirmationReference,
            method: "card",
            paymentReference,
            preparationReference,
          });
        }),
        Carts.layerMemory({ carts: [readyCart] }),
        undefined,
        DeliveryPlanning.layerMemory(() => Effect.succeed(quote)),
        payments
      );
    }
  );
});
