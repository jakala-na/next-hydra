import { ActionClient, ActionMiddleware } from "@repo/actions";
import { Effect, Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";

import { CountryCode } from "../domain/address";
import { AddressBookEntry, AddressBookReference } from "../domain/address-book";
import { CartId, LineItemId, ProductId, VariantId } from "../domain/cart";
import type { CheckoutState } from "../domain/checkout";
import {
  CheckoutVersionConflict,
  StorefrontCustomerCheckoutScope,
} from "../domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../domain/commerce-account";
import { AnonymousCommercePrincipal } from "../domain/commerce-request-context";
import type {
  CheckoutSaveContactFailure,
  SaveCheckoutContactInput,
  SaveCheckoutDeliveryDetailsInput,
  SaveCheckoutDeliveryDetailsResult,
} from "../lib/checkout/checkout-session";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import { AddressBook } from "../services/address-book";
import { CommerceContext } from "../services/commerce-context";
import { CommerceLocale, resolveStore, StoreKey } from "../store";
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
}) => {
  let provideCalls = 0;
  let getLocaleCalls = 0;

  const checkoutSession = {
    getCurrent: () => Effect.succeed(checkoutState),
    saveContact:
      options?.saveContact ??
      ((_input: SaveCheckoutContactInput) => Effect.succeed(checkoutState)),
    saveDeliveryDetails:
      options?.saveDeliveryDetails ??
      ((_input: SaveCheckoutDeliveryDetailsInput) =>
        Effect.succeed({ state: checkoutState })),
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

  const { saveCheckoutContactProcedure, saveCheckoutDeliveryDetailsProcedure } =
    makeCheckoutProcedures(TestCommerceActions);

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
  };
};

describe("Checkout boundaries", () => {
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
});
