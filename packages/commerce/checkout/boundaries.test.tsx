import { ActionClient, ActionMiddleware } from "@repo/actions";
import { Effect, Layer, ManagedRuntime } from "effect";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CountryCode } from "../domain/address";
import { AddressBookEntry, AddressBookReference } from "../domain/address-book";
import { CartId, LineItemId, ProductId, VariantId } from "../domain/cart";
import type { CheckoutState } from "../domain/checkout";
import {
  CheckoutCartMismatch,
  CheckoutMutationOutcomeUnknown,
  CheckoutMutationProviderFailure,
  CheckoutShippingOptionsRefreshRequired,
  CheckoutShippingSelectionUnavailable,
  CheckoutVersionConflict,
  StorefrontCustomerCheckoutScope,
} from "../domain/checkout";
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
import type {
  CheckoutSaveContactFailure,
  CheckoutSaveShippingOptionsFailure,
  SaveCheckoutContactInput,
  SaveCheckoutDeliveryDetailsInput,
  SaveCheckoutDeliveryDetailsResult,
  SaveCheckoutShippingOptionsInput,
} from "../lib/checkout/checkout-session";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import { AddressBook } from "../services/address-book";
import { CommerceContext } from "../services/commerce-context";
import { CommerceLocale, resolveStore, StoreKey } from "../store";
import { CartSidebar } from "./checkout-view";
import type { CheckoutPageMessages } from "./checkout-view";
import { makeCheckoutProcedures } from "./procedures";
import { MANUAL_DELIVERY_ADDRESS_CHOICE } from "./save-delivery-details-action-contract";

const checkoutState: CheckoutState = {
  activeStep: "contact",
  cart: {
    checkoutDetails: {},
    id: CartId.make("cart-1"),
    lineItems: [
      {
        id: LineItemId.make("line-item-1"),
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
    storeKey: StoreKey.make("default-store"),
    totalLineItemQuantity: 1,
    totalPrice: { centAmount: 2500, currencyCode: "USD" },
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
          totalPrice: { centAmount: 2500, currencyCode: "USD" },
          unitPrice: { centAmount: 2500, currencyCode: "USD" },
          variant: {
            attributes: {},
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
      totalPrice: { centAmount: 2500, currencyCode: "USD" },
    },
    details: {},
    scope: {
      _tag: "StorefrontCustomerCheckoutScope",
      businessUnitId: "business-unit-1",
      businessUnitKey: "business-unit-key",
      channel: "storefrontCustomer",
      customerId: "customer-1",
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
    saveContact:
      options?.saveContact ??
      ((_input: SaveCheckoutContactInput) => Effect.succeed(checkoutState)),
    saveDeliveryDetails:
      options?.saveDeliveryDetails ??
      ((_input: SaveCheckoutDeliveryDetailsInput) =>
        Effect.succeed({ state: checkoutState })),
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
    saveCheckoutShippingOptionsProcedure,
  } = makeCheckoutProcedures(TestCommerceActions);

  return {
    checkoutSession,
    getLocaleCalls: () => getLocaleCalls,
    provideCalls: () => provideCalls,
    saveCheckoutContact: saveCheckoutContactProcedure.toFormAction({
      getFailureMessage: (error) => `Localized en-US ${error._tag}`,
    }),
    saveCheckoutContactProcedure,
    saveCheckoutDeliveryDetails:
      saveCheckoutDeliveryDetailsProcedure.toFormAction({
        getFailureMessage: (error) => `Localized en-US ${error._tag}`,
      }),
    saveCheckoutShippingOptions:
      saveCheckoutShippingOptionsProcedure.toFormAction({
        getFailureMessage: (error) => `Localized en-US ${error._tag}`,
      }),
  };
};

describe("Checkout boundaries", () => {
  it("renders merchandise subtotal separately from selected Shipping", () => {
    const selectedShippingOption = {
      name: "Standard",
      price: { centAmount: 500, currencyCode: "USD" as const },
      reference: ShippingOptionReference.make("standard"),
    };
    const state: CheckoutState = {
      ...checkoutState,
      activeStep: "paymentOptions",
      cart: {
        ...checkoutState.cart,
        totalPrice: { centAmount: 3000, currencyCode: "USD" },
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
      cartItems: (count: number) => `${count} items`,
      cartQuantity: (quantity: number) => `Quantity ${quantity}`,
      cartTitle: "Cart",
      cartViolations: "Cart issues",
      delivery: (number: number) => `Delivery ${number}`,
      editDeliveryDetails: "Edit delivery details",
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
    const contact = new FormData();
    contact.set("cartId", "cart-1");
    contact.set("source", "manual");
    contact.set("email", "ada@example.com");
    contact.set("firstName", "Ada");
    contact.set("lastName", "Lovelace");

    const deliveryDetails = new FormData();
    deliveryDetails.set("cartId", "cart-1");
    deliveryDetails.set("addressLine1", "1 Hydra Way");
    deliveryDetails.set("postalCode", "10001");
    deliveryDetails.set("city", "New York");
    deliveryDetails.set("country", "us");
    deliveryDetails.set(
      "deliveryAddressChoice",
      MANUAL_DELIVERY_ADDRESS_CHOICE
    );

    const contactResult = await harness.saveCheckoutContact(null, contact);
    const deliveryDetailsResult = await harness.saveCheckoutDeliveryDetails(
      null,
      deliveryDetails
    );

    expect(contactResult).toStrictEqual(encodedCheckoutSuccess);
    expect(deliveryDetailsResult).toStrictEqual(encodedCheckoutSuccess);
    expect(harness.provideCalls()).toBe(2);
  });

  it("uses the native delivery address choice as the submitted Address Book reference", async () => {
    let received: unknown;
    const harness = makeCheckoutHarness({
      saveDeliveryDetails: (input) => {
        received = input;
        return Effect.succeed({ state: checkoutState });
      },
    });

    const deliveryDetails = new FormData();
    deliveryDetails.set("cartId", "cart-1");
    deliveryDetails.set("deliveryAddressChoice", "office");

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
    const contact = new FormData();
    contact.set("cartId", "cart-1");
    contact.set("source", "customerProfile");

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
    const contact = new FormData();
    contact.set("cartId", "cart-1");
    contact.set("source", "manual");
    contact.set("email", "");
    contact.set("firstName", "");
    contact.set("lastName", "");

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
            { message: "This field is invalid.", path: ["email"] },
            { message: "This field is invalid.", path: ["firstName"] },
            { message: "This field is invalid.", path: ["lastName"] },
          ],
          message: "Invalid input.",
          recovery: "fix_input",
        },
      },
    });
    expect(harness.getLocaleCalls()).toBe(1);
    expect(saveContactCalls).toBe(0);
  });

  it("returns delivery schema failures with the invalid field paths", async () => {
    let saveDeliveryCalls = 0;
    const harness = makeCheckoutHarness({
      saveDeliveryDetails: () => {
        saveDeliveryCalls += 1;
        return Effect.succeed({ state: checkoutState });
      },
    });
    const deliveryDetails = new FormData();
    deliveryDetails.set("addressLine1", "");
    deliveryDetails.set("cartId", "cart-1");
    deliveryDetails.set("city", "");
    deliveryDetails.set("country", "");
    deliveryDetails.set(
      "deliveryAddressChoice",
      MANUAL_DELIVERY_ADDRESS_CHOICE
    );
    deliveryDetails.set("postalCode", "");

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
            { message: "This field is invalid.", path: ["addressLine1"] },
            { message: "This field is invalid.", path: ["city"] },
            { message: "This field is invalid.", path: ["country"] },
            { message: "This field is invalid.", path: ["postalCode"] },
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
    const contact = new FormData();
    contact.set("cartId", "cart-1");
    contact.set("source", "customerProfile");

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
      const form = new FormData();
      form.set("cartId", "cart-1");
      form.set(
        "selection",
        JSON.stringify({
          groups: [
            {
              deliveryGroupReference: DeliveryGroupReference.make("delivery-1"),
              shippingOptionReference: ShippingOptionReference.make("standard"),
            },
          ],
          quoteReference: DeliveryPlanQuoteReference.make("quote-1"),
          reference: DeliveryPlanReference.make("plan-1"),
        })
      );

      // oxlint-disable-next-line no-await-in-loop -- Each isolated action boundary must complete before asserting its projected error.
      const result = await harness.saveCheckoutShippingOptions(null, form);
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { error: expected },
      });
    }
  });
});
