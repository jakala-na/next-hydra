import { ActionClient, ActionMiddleware } from "@repo/actions";
import {
  PaymentAttemptReference,
  PaymentReference,
  PreparedPaymentReference,
} from "@repo/payments";
import { Effect, Layer, ManagedRuntime } from "effect";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CountryCode } from "../domain/address";
import { AddressBookEntry, AddressBookReference } from "../domain/address-book";
import { CartId, LineItemId, ProductId, VariantId } from "../domain/cart";
import { CartSnapshotVersion } from "../domain/cart-snapshot";
import {
  CheckoutCartMismatch,
  CheckoutMutationOutcomeUnknown,
  CheckoutMutationProviderFailure,
  CheckoutShippingOptionsRefreshRequired,
  CheckoutShippingSelectionUnavailable,
  CheckoutVersionConflict,
  StorefrontCustomerCheckoutScope,
} from "../domain/checkout";
import type {
  SaveCheckoutContactInput,
  SaveCheckoutDeliveryDetailsInput,
  SaveCheckoutShippingOptionsInput,
} from "../domain/checkout";
import type { CheckoutState } from "../domain/checkout-state";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../domain/commerce-account";
import { AnonymousCommercePrincipal } from "../domain/commerce-request-context";
import {
  DeliveryGroupReference,
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
  ShippingOptionReference,
} from "../domain/delivery-plan";
import { money } from "../domain/money";
import type {
  CheckoutSaveContactFailure,
  CheckoutSaveShippingOptionsFailure,
  SaveCheckoutDeliveryDetailsResult,
} from "../lib/checkout/checkout-session";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import { AddressBook } from "../services/address-book";
import { CommerceContext } from "../services/commerce-context";
import { CommerceLocale, resolveStore, StoreKey } from "../store";
import type { SaveCheckoutShippingOptionsActionInput } from "./action-contract";
import { CartSidebar } from "./checkout-view";
import type { CheckoutPageMessages } from "./checkout-view";
import { makeCheckoutProcedures } from "./procedures";

const checkoutState: CheckoutState = {
  activeStep: "contact",
  cart: {
    checkoutDetails: {},
    id: CartId.make("cart-1"),
    lineItems: [
      {
        id: LineItemId.make("line-item-1"),
        quantity: 1,
        totalPrice: money(2500, "USD"),
        unitPrice: money(2500, "USD"),
        variant: {
          id: VariantId.make("variant-1"),
          images: [],
          name: "Hydra Wrench",
          productId: ProductId.make("product-1"),
        },
      },
    ],
    status: "active",
    storeKey: StoreKey.make("default-store"),
    totalLineItemQuantity: 1,
    totalPrice: money(2500, "USD"),
    version: CartSnapshotVersion.make("cart-1"),
  },
  details: {},
  scope: new StorefrontCustomerCheckoutScope({
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key"),
    channel: "storefrontCustomer",
    customerId: CommerceCustomerId.make("customer-1"),
    locale: CommerceLocale.make("en-US"),
  }),
  steps: [
    { id: "contact", status: "incomplete" },
    { id: "deliveryDetails", status: "incomplete" },
    { id: "shippingOptions", status: "incomplete" },
    { id: "paymentOptions", status: "incomplete" },
    { id: "reviewOrder", status: "incomplete" },
  ],
  violations: [],
};

const encodedCheckoutSuccess = {
  _tag: "Success",
  success: {
    activeStep: "contact",
    cart: {
      checkoutDetails: {},
      id: "cart-1",
      lineItems: [
        {
          id: "line-item-1",
          quantity: 1,
          totalPrice: money(2500, "USD"),
          unitPrice: money(2500, "USD"),
          variant: {
            id: "variant-1",
            images: [],
            name: "Hydra Wrench",
            productId: "product-1",
          },
        },
      ],
      status: "active",
      storeKey: "default-store",
      totalLineItemQuantity: 1,
      totalPrice: money(2500, "USD"),
      version: "cart-1",
    },
    details: {},
    scope: {
      channel: "storefrontCustomer",
      locale: "en-US",
    },
    steps: [
      { id: "contact", status: "incomplete" },
      { id: "deliveryDetails", status: "incomplete" },
      { id: "shippingOptions", status: "incomplete" },
      { id: "paymentOptions", status: "incomplete" },
      { id: "reviewOrder", status: "incomplete" },
    ],
    violations: [],
  },
} as const;

const shippingAddress = new AddressBookEntry({
  address: {
    addressLine1: "1 Hydra Way",
    city: "New York",
    country: CountryCode.make("US"),
    postalCode: "10001",
  },
  defaultBilling: false,
  defaultShipping: true,
  reference: AddressBookReference.make("office"),
  types: ["shipping"],
});

const makeCheckoutHarness = (options?: {
  readonly saveContact?: (
    input: SaveCheckoutContactInput
  ) => Effect.Effect<CheckoutState, CheckoutSaveContactFailure>;
  readonly saveDeliveryDetails?: (
    input: SaveCheckoutDeliveryDetailsInput
  ) => Effect.Effect<SaveCheckoutDeliveryDetailsResult>;
  readonly saveShippingOptions?: (
    input: SaveCheckoutShippingOptionsInput
  ) => Effect.Effect<CheckoutState, CheckoutSaveShippingOptionsFailure>;
}) => {
  let provideCalls = 0;
  let getLocaleCalls = 0;

  const checkoutSession = {
    getCurrent: () => Effect.succeed(checkoutState),
    getCurrentWithDeliveryPlans: () =>
      Effect.succeed({
        deliveryPlanQuote: {
          plans: [],
          reference: DeliveryPlanQuoteReference.make("empty-delivery-quote"),
        },
        state: checkoutState,
      }),
    placeOrder: () => Effect.die("not used"),
    preparePaymentOptions: () => Effect.die("not used"),
    saveContact:
      options?.saveContact ??
      ((_input: SaveCheckoutContactInput) => Effect.succeed(checkoutState)),
    saveDeliveryDetails:
      options?.saveDeliveryDetails ??
      ((_input: SaveCheckoutDeliveryDetailsInput) =>
        Effect.succeed({ state: checkoutState })),
    savePaymentOptions: () => Effect.die("not used"),
    saveShippingOptions:
      options?.saveShippingOptions ??
      ((_input: SaveCheckoutShippingOptionsInput) =>
        Effect.succeed(checkoutState)),
  };

  const addressBook = {
    get: () => Effect.die("not used"),
    list: () => Effect.succeed([shippingAddress]),
    save: () => Effect.die("not used"),
  };

  const commerceContext = CommerceContext.of({
    customerPrincipal: () => Effect.die("not used"),
    customerProfile: () => Effect.die("not used"),
    principal: new AnonymousCommercePrincipal(),
    store: resolveStore({ locale: CommerceLocale.make("en-US") }),
  });

  const checkoutLayer = Layer.mergeAll(
    Layer.succeed(CheckoutSession, checkoutSession),
    Layer.succeed(AddressBook, addressBook),
    Layer.succeed(CommerceContext, commerceContext)
  );

  const TestCommerceActions = ActionClient.make(
    ManagedRuntime.make(Layer.empty)
  )
    .use(
      ActionMiddleware.context(() =>
        Effect.sync(() => {
          getLocaleCalls += 1;
          return { locale: "en-US" as const };
        })
      )
    )
    .provide((_context: { readonly locale: string }) =>
      Layer.unwrap(
        Effect.sync(() => {
          provideCalls += 1;
          return checkoutLayer;
        })
      )
    );

  const {
    saveCheckoutContactProcedure,
    saveCheckoutDeliveryDetailsProcedure,
    saveCheckoutPaymentOptionsProcedure,
    saveCheckoutShippingOptionsProcedure,
  } = makeCheckoutProcedures(TestCommerceActions);

  return {
    checkoutSession,
    getLocaleCalls: () => getLocaleCalls,
    provideCalls: () => provideCalls,
    saveCheckoutContact: saveCheckoutContactProcedure.toActionState({
      getFailureMessage: (error) => `Localized en-US ${error._tag}`,
    }),
    saveCheckoutContactProcedure,
    saveCheckoutDeliveryDetails:
      saveCheckoutDeliveryDetailsProcedure.toActionState({
        getFailureMessage: (error) => `Localized en-US ${error._tag}`,
      }),
    saveCheckoutPaymentOptions:
      saveCheckoutPaymentOptionsProcedure.toActionState({
        getFailureMessage: (error) => `Localized en-US ${error._tag}`,
      }),
    saveCheckoutShippingOptions:
      saveCheckoutShippingOptionsProcedure.toActionState({
        getFailureMessage: (error) => `Localized en-US ${error._tag}`,
      }),
  };
};

describe("Checkout boundaries", () => {
  it("renders merchandise subtotal separately from selected Shipping", () => {
    const selectedShippingOption = {
      name: "Standard",
      price: money(500, "USD"),
      reference: ShippingOptionReference.make("standard"),
    };
    const state: CheckoutState = {
      ...checkoutState,
      activeStep: "paymentOptions",
      cart: {
        ...checkoutState.cart,
        totalPrice: money(3000, "USD"),
      },
      details: {
        selectedDeliveryPlan: {
          groups: [
            {
              reference: DeliveryGroupReference.make("delivery-1"),
              selectedShippingOption,
              shippingAddress: shippingAddress.address,
              targets: [
                {
                  lineItemId: LineItemId.make("line-item-1"),
                  quantity: 1,
                },
              ],
            },
          ],
          quoteReference: DeliveryPlanQuoteReference.make("quote-1"),
          reference: DeliveryPlanReference.make("plan-1"),
        },
      },
      steps: checkoutState.steps.map((step) => ({
        ...step,
        status:
          step.id === "contact" || step.id === "shippingOptions"
            ? "complete"
            : "incomplete",
      })),
    };

    const messages = {
      activeStep: "Active",
      attention: "Attention",
      card: "Card",
      cartItems: (count: number) => `${count} items`,
      cartQuantity: (quantity: number) => `Quantity ${quantity}`,
      cartTitle: "Cart",
      cartViolations: "Cart issues",
      delivery: (number: number) => `Delivery ${number}`,
      editDeliveryDetails: "Edit delivery details",
      netTerms: (days: number) => `Net ${days}`,
      paymentMethod: "Payment method",
      stepLabels: {
        contact: "Contact",
        deliveryDetails: "Delivery details",
        paymentOptions: "Payment options",
        reviewOrder: "Review order",
        shippingOptions: "Shipping options",
      },
      stepStatuses: {
        complete: "Complete",
        incomplete: "Incomplete",
      },
      subtotal: "Subtotal",
      violation: () => "Violation",
    } satisfies CheckoutPageMessages;
    const markup = renderToStaticMarkup(
      <CartSidebar messages={messages} state={state} />
    );

    expect(markup).toContain(
      'data-commerce-money="checkout-subtotal" data-currency="USD" data-minor-amount="2500"'
    );
    expect(markup).toContain(
      'data-commerce-money="selected-shipping-option" data-currency="USD" data-minor-amount="500"'
    );
  });

  it("runs each Checkout mutation with fresh request state", async () => {
    const harness = makeCheckoutHarness();
    const contact = {
      cart: { id: "cart-1" },
      contact: {
        buyerContact: {
          email: "ada@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
        source: "manual" as const,
      },
    };
    const deliveryDetails = {
      cart: { id: "cart-1" },
      deliveryDetails: {
        saveToAddressBook: false as const,
        shippingAddress: {
          addressLine1: "1 Hydra Way",
          city: "New York",
          country: "us",
          postalCode: "10001",
        },
        type: "manual" as const,
      },
    };

    const contactResult = await harness.saveCheckoutContact(null, contact);
    const deliveryDetailsResult = await harness.saveCheckoutDeliveryDetails(
      null,
      deliveryDetails
    );

    expect(contactResult).toStrictEqual(encodedCheckoutSuccess);
    expect(deliveryDetailsResult).toStrictEqual(encodedCheckoutSuccess);
    expect(harness.provideCalls()).toBe(2);
  });

  it("projects internal payment references out of Action success values", async () => {
    const preparedPayment = {
      amount: checkoutState.cart.totalPrice,
      attemptReference: PaymentAttemptReference.make("private-attempt"),
      billingAddress: shippingAddress.address,
      method: "card" as const,
      paymentReference: PaymentReference.make("private-payment-reference"),
      preparationReference: PreparedPaymentReference.make(
        "private-preparation-reference"
      ),
    };
    const state = {
      ...checkoutState,
      cart: {
        ...checkoutState.cart,
        checkoutDetails: { preparedPayment },
      },
      details: { preparedPayment },
    } satisfies CheckoutState;
    const harness = makeCheckoutHarness({
      saveContact: () => Effect.succeed(state),
    });
    const contact = {
      cart: { id: "cart-1" },
      contact: { source: "customerProfile" as const },
    };

    const result = await harness.saveCheckoutContact(null, contact);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(preparedPayment.paymentReference);
    expect(serialized).not.toContain(preparedPayment.attemptReference);
    expect(serialized).not.toContain(preparedPayment.preparationReference);
  });

  it("passes the structured Address Book selection to Checkout Session", async () => {
    let received: unknown;
    const harness = makeCheckoutHarness({
      saveDeliveryDetails: (input) => {
        received = input;
        return Effect.succeed({ state: checkoutState });
      },
    });

    const deliveryDetails = {
      cart: { id: "cart-1" },
      deliveryDetails: {
        addressBookReference: "office",
        type: "addressBook" as const,
      },
    };

    await expect(
      harness.saveCheckoutDeliveryDetails(null, deliveryDetails)
    ).resolves.toStrictEqual(encodedCheckoutSuccess);
    expect(received).toStrictEqual({
      cart: { id: "cart-1" },
      deliveryDetails: {
        addressBookReference: "office",
        type: "addressBook",
      },
    });
  });

  it("executes the shared procedure directly with the same encoded result", async () => {
    const harness = makeCheckoutHarness();
    const contact = {
      cart: { id: "cart-1" },
      contact: { source: "customerProfile" as const },
    };

    await expect(
      harness.saveCheckoutContactProcedure.execute(contact)
    ).resolves.toStrictEqual(encodedCheckoutSuccess);
  });

  it("returns schema failures without running the Checkout Session", async () => {
    let saveContactCalls = 0;
    const harness = makeCheckoutHarness({
      saveContact: () => {
        saveContactCalls += 1;
        return Effect.succeed(checkoutState);
      },
    });
    const contact = {
      cart: { id: "cart-1" },
      contact: {
        buyerContact: { email: "", firstName: "", lastName: "" },
        source: "manual" as const,
      },
    };

    const result = await harness.saveCheckoutContact(null, contact);

    expect(result).toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Localized en-US InputInvalid",
        error: {
          _tag: "InputInvalid",
          category: "bad_input",
          code: "input.invalid",
          issues: [
            {
              message: "This field is invalid.",
              path: ["contact", "buyerContact", "email"],
            },
            {
              message: "This field is invalid.",
              path: ["contact", "buyerContact", "firstName"],
            },
            {
              message: "This field is invalid.",
              path: ["contact", "buyerContact", "lastName"],
            },
          ],
          message: "Invalid input.",
          recovery: "fix_input",
        },
      },
    });
    expect(harness.getLocaleCalls()).toBe(1);
    expect(saveContactCalls).toBe(0);
  });

  it("maps an invalid Payment Method to its structured input path", async () => {
    const harness = makeCheckoutHarness();
    const paymentOptions = {
      cart: { id: "cart-1" },
      selection: {
        billingAddress: { source: "shippingAddress" as const },
        payment: {
          method: "invented-method",
        },
      },
    };

    await expect(
      // @ts-expect-error -- Exercise the untrusted Server Action boundary.
      harness.saveCheckoutPaymentOptions(null, paymentOptions)
    ).resolves.toMatchObject({
      _tag: "Failure",
      failure: {
        error: {
          _tag: "InputInvalid",
          issues: [
            {
              message: "This field is invalid.",
              path: ["selection", "payment"],
            },
          ],
        },
      },
    });
  });

  it("returns delivery schema failures with the invalid field paths", async () => {
    let saveDeliveryCalls = 0;
    const harness = makeCheckoutHarness({
      saveDeliveryDetails: () => {
        saveDeliveryCalls += 1;
        return Effect.succeed({ state: checkoutState });
      },
    });
    const deliveryDetails = {
      cart: { id: "cart-1" },
      deliveryDetails: {
        saveToAddressBook: false as const,
        shippingAddress: {
          addressLine1: "",
          city: "",
          country: "",
          postalCode: "",
        },
        type: "manual" as const,
      },
    };

    const result = await harness.saveCheckoutDeliveryDetails(
      null,
      deliveryDetails
    );

    expect(result).toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Localized en-US InputInvalid",
        error: {
          _tag: "InputInvalid",
          category: "bad_input",
          code: "input.invalid",
          issues: [
            {
              message: "This field is invalid.",
              path: ["deliveryDetails", "shippingAddress", "addressLine1"],
            },
            {
              message: "This field is invalid.",
              path: ["deliveryDetails", "shippingAddress", "city"],
            },
            {
              message: "This field is invalid.",
              path: ["deliveryDetails", "shippingAddress", "country"],
            },
            {
              message: "This field is invalid.",
              path: ["deliveryDetails", "shippingAddress", "postalCode"],
            },
          ],
          message: "Invalid input.",
          recovery: "fix_input",
        },
      },
    });
    expect(saveDeliveryCalls).toBe(0);
  });

  it("returns typed mutation failures unchanged", async () => {
    const harness = makeCheckoutHarness({
      saveContact: () =>
        Effect.fail(
          new CheckoutVersionConflict({
            cartId: CartId.make("cart-1"),
            message: "Checkout changed before Contact could be saved",
          })
        ),
    });
    const contact = {
      cart: { id: "cart-1" },
      contact: { source: "customerProfile" as const },
    };

    await expect(
      harness.saveCheckoutContact(null, contact)
    ).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Localized en-US CheckoutVersionConflict",
        error: {
          _tag: "CheckoutVersionConflict",
          cartId: "cart-1",
          category: "conflict",
          code: "checkout.versionConflict",
          message:
            "Checkout changed before your details could be saved. Refresh and try again.",
          recovery: "refresh",
        },
      },
    });
  });

  it("maps every expected Shipping Options service state at the action boundary", async () => {
    const failures: readonly {
      readonly error: CheckoutSaveShippingOptionsFailure;
      readonly expected: {
        readonly code: string;
        readonly recovery: "refresh" | "retry";
      };
    }[] = [
      {
        error: new CheckoutCartMismatch({
          currentCartId: CartId.make("cart-current"),
          message: "Cart mismatch",
          submittedCartId: CartId.make("cart-1"),
        }),
        expected: { code: "checkout.cartMismatch", recovery: "refresh" },
      },
      {
        error: new CheckoutShippingSelectionUnavailable({
          message: "Stale selection",
          planReference: DeliveryPlanReference.make("plan-1"),
          quoteReference: DeliveryPlanQuoteReference.make("quote-1"),
          shippingOptionReference: ShippingOptionReference.make("standard"),
        }),
        expected: {
          code: "checkout.shippingOptions.selectionUnavailable",
          recovery: "refresh",
        },
      },
      {
        error: new CheckoutVersionConflict({
          cartId: CartId.make("cart-1"),
          message: "Conflict",
        }),
        expected: { code: "checkout.versionConflict", recovery: "refresh" },
      },
      {
        error: new CheckoutMutationOutcomeUnknown({
          cartId: CartId.make("cart-1"),
          message: "Unknown outcome",
          operation: "saveShippingOptions",
        }),
        expected: {
          code: "checkout.shippingOptions.outcomeUnknown",
          recovery: "refresh",
        },
      },
      {
        error: new CheckoutMutationProviderFailure({
          message: "Unavailable",
          operation: "checkout.shippingOptions.save",
          reason: "unavailable",
        }),
        expected: {
          code: "checkout.shippingOptions.providerFailure",
          recovery: "retry",
        },
      },
      {
        error: new CheckoutShippingOptionsRefreshRequired({
          cartId: CartId.make("cart-1"),
          message: "Saved but refresh failed",
        }),
        expected: {
          code: "checkout.shippingOptions.refreshRequired",
          recovery: "refresh",
        },
      },
    ];

    for (const { error, expected } of failures) {
      const harness = makeCheckoutHarness({
        saveShippingOptions: () => Effect.fail(error),
      });
      const input: SaveCheckoutShippingOptionsActionInput = {
        cart: { id: "cart-1" },
        selection: {
          groups: [
            {
              deliveryGroupReference: DeliveryGroupReference.make("delivery-1"),
              shippingOptionReference: ShippingOptionReference.make("standard"),
            },
          ],
          quoteReference: DeliveryPlanQuoteReference.make("quote-1"),
          reference: DeliveryPlanReference.make("plan-1"),
        },
      };

      // oxlint-disable-next-line no-await-in-loop -- Each isolated action boundary must complete before asserting its projected error.
      const result = await harness.saveCheckoutShippingOptions(null, input);
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { error: expected },
      });
    }
  });
});
