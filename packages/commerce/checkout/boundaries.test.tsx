import { ActionClient, ActionMiddleware } from "@repo/actions";
import { Effect, Layer, ManagedRuntime } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CountryCode } from "../domain/address";
import { AddressBookEntry, AddressBookReference } from "../domain/address-book";
import { CartId, LineItemId, ProductId, VariantId } from "../domain/cart";
import {
  type CheckoutState,
  CheckoutUnavailable,
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
  type CheckoutSaveContactFailure,
  CheckoutSession,
} from "../lib/checkout/checkout-session";
import { AddressBook } from "../services/address-book";
import { CommerceContext } from "../services/commerce-context";
import { CommerceLocale, resolveStore, StoreKey } from "../store";
import { CheckoutPage } from "./checkout-page";
import { makeCheckoutProcedures } from "./procedures";
import { MANUAL_DELIVERY_ADDRESS_CHOICE } from "./save-delivery-details-action-contract";

const boundary = vi.hoisted(() => ({
  connection: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  getLocale: vi.fn(async () => "en-US" as const),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  provide: vi.fn(),
  runPromise: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/i18n", () => ({
  getLocale: boundary.getLocale,
  getTranslations: async () => (key: string) => key,
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({ notFound: boundary.notFound }));
vi.mock("next/server", () => ({ connection: boundary.connection }));
vi.mock("@repo/commerce/runtime", async () => {
  return {
    NextCommerce: {
      provide: boundary.provide,
      runPromise: boundary.runPromise,
    },
  };
});

const TestCommerceActions = ActionClient.make(ManagedRuntime.make(Layer.empty))
  .use(
    ActionMiddleware.context(() =>
      Effect.promise(boundary.getLocale).pipe(
        Effect.map((locale) => ({ locale }))
      )
    )
  )
  .provide(({ locale }: { readonly locale: string }) =>
    Layer.unwrap(
      Effect.sync(() => {
        boundary.provide(locale);
        return checkoutLayer();
      })
    )
  );
const { saveCheckoutContactProcedure, saveCheckoutDeliveryDetailsProcedure } =
  makeCheckoutProcedures(TestCommerceActions);
const saveCheckoutContact = saveCheckoutContactProcedure.toFormAction({
  getFailureMessage: (error) => `Localized en-US ${error._tag}`,
});
const saveCheckoutDeliveryDetails =
  saveCheckoutDeliveryDetailsProcedure.toFormAction({
    getFailureMessage: (error) => `Localized en-US ${error._tag}`,
  });
const checkoutActions = {
  saveContact: saveCheckoutContact,
  saveDeliveryDetails: saveCheckoutDeliveryDetails,
};

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

const checkoutSession = {
  getCurrent: vi.fn<() => Effect.Effect<CheckoutState, CheckoutUnavailable>>(
    () => Effect.succeed(checkoutState)
  ),
  saveContact: vi.fn<
    () => Effect.Effect<CheckoutState, CheckoutSaveContactFailure>
  >(() => Effect.succeed(checkoutState)),
  saveDeliveryDetails: vi.fn(() => Effect.succeed({ state: checkoutState })),
};

const addressBook = {
  get: vi.fn(() => Effect.die("not used")),
  list: vi.fn(() => Effect.succeed([shippingAddress])),
  save: vi.fn(() => Effect.die("not used")),
};

const commerceContext = CommerceContext.of({
  store: resolveStore({ locale: CommerceLocale.make("en-US") }),
  principal: new AnonymousCommercePrincipal(),
  customerPrincipal: () => Effect.die("not used"),
  customerProfile: () => Effect.die("not used"),
});

const checkoutLayer = () =>
  Layer.mergeAll(
    Layer.succeed(CheckoutSession, checkoutSession),
    Layer.succeed(AddressBook, addressBook),
    Layer.succeed(CommerceContext, commerceContext)
  );

beforeEach(() => {
  boundary.connection.mockClear();
  boundary.getLocale.mockClear();
  boundary.notFound.mockClear();
  boundary.provide.mockReset();
  boundary.provide.mockImplementation(
    (_locale) =>
      (
        program: Effect.Effect<
          unknown,
          unknown,
          AddressBook | CheckoutSession | CommerceContext
        >
      ) =>
        program.pipe(Effect.provide(checkoutLayer()))
  );
  boundary.runPromise.mockReset();
  boundary.runPromise.mockImplementation(Effect.runPromise);
  checkoutSession.getCurrent.mockReset();
  checkoutSession.getCurrent.mockImplementation(() =>
    Effect.succeed(checkoutState)
  );
  checkoutSession.saveContact.mockReset();
  checkoutSession.saveContact.mockImplementation(() =>
    Effect.succeed(checkoutState)
  );
  checkoutSession.saveDeliveryDetails.mockReset();
  checkoutSession.saveDeliveryDetails.mockImplementation(() =>
    Effect.succeed({ state: checkoutState })
  );
  addressBook.list.mockClear();
});

describe("Checkout boundaries", () => {
  it("loads Checkout and projects Shipping Address options", async () => {
    const page = await CheckoutPage({
      actions: checkoutActions,
      locale: "en-US",
    });

    expect(boundary.provide).toHaveBeenCalledOnce();
    expect(page.props.state).toEqual(checkoutState);
    expect(page.props.shippingAddressOptions).toEqual([
      {
        address: shippingAddress.address,
        defaultShipping: true,
        reference: "office",
      },
    ]);
    expect(page.props.actions).toEqual(checkoutActions);
  });

  it("enters dynamic rendering before starting the Effect runtime", async () => {
    await CheckoutPage({ actions: checkoutActions, locale: "en-US" });

    expect(boundary.connection).toHaveBeenCalledOnce();
    expect(boundary.connection.mock.invocationCallOrder[0]).toBeLessThan(
      boundary.runPromise.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY
    );
  });

  it("uses notFound when there is no current Checkout", async () => {
    checkoutSession.getCurrent.mockImplementation(() =>
      Effect.fail(
        new CheckoutUnavailable({
          message: "Checkout requires an existing Cart",
          reason: "noCart",
        })
      )
    );

    await expect(
      CheckoutPage({ actions: checkoutActions, locale: "en-US" })
    ).rejects.toThrow("notFound");
    expect(boundary.notFound).toHaveBeenCalledOnce();
  });

  it("runs each Checkout mutation with fresh request state", async () => {
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

    const contactResult = await saveCheckoutContact(null, contact);
    const deliveryDetailsResult = await saveCheckoutDeliveryDetails(
      null,
      deliveryDetails
    );

    expect(contactResult).toEqual({
      _tag: "Success",
      success: checkoutState,
    });
    expect(deliveryDetailsResult).toEqual({
      _tag: "Success",
      success: checkoutState,
    });
    expect(boundary.provide).toHaveBeenCalledTimes(2);
    expect(checkoutSession.saveDeliveryDetails).toHaveBeenCalledWith({
      cart: { id: "cart-1" },
      deliveryDetails: {
        saveToAddressBook: false,
        shippingAddress: {
          addressLine1: "1 Hydra Way",
          city: "New York",
          country: "US",
          postalCode: "10001",
        },
        type: "manual",
      },
    });
  });

  it("uses the native delivery address choice as the submitted Address Book reference", async () => {
    const deliveryDetails = new FormData();
    deliveryDetails.set("cartId", "cart-1");
    deliveryDetails.set("deliveryAddressChoice", "office");

    await expect(
      saveCheckoutDeliveryDetails(null, deliveryDetails)
    ).resolves.toEqual({
      _tag: "Success",
      success: checkoutState,
    });
    expect(checkoutSession.saveDeliveryDetails).toHaveBeenCalledWith({
      cart: { id: "cart-1" },
      deliveryDetails: {
        addressBookReference: "office",
        type: "addressBook",
      },
    });
  });

  it("executes the shared procedure directly with the same encoded result", async () => {
    const contact = new FormData();
    contact.set("cartId", "cart-1");
    contact.set("source", "customerProfile");

    await expect(
      saveCheckoutContactProcedure.execute(contact)
    ).resolves.toEqual({
      _tag: "Success",
      success: checkoutState,
    });
    expect(checkoutSession.saveContact).toHaveBeenCalledOnce();
  });

  it("returns schema failures without running the Checkout Session", async () => {
    const contact = new FormData();
    contact.set("cartId", "cart-1");
    contact.set("source", "manual");
    contact.set("email", "");
    contact.set("firstName", "");
    contact.set("lastName", "");

    const result = await saveCheckoutContact(null, contact);

    expect(result._tag).toBe("Failure");
    if (result._tag !== "Failure") {
      throw new Error("Expected Checkout Contact validation to fail");
    }
    expect(result.failure.error._tag).toBe("InputInvalid");
    if (result.failure.error._tag !== "InputInvalid") {
      throw new Error("Expected an Action Input Invalid failure");
    }
    expect(result.failure.displayMessage).toBe("Localized en-US InputInvalid");
    expect(result.failure.error.issues).toEqual([
      { message: "This field is invalid.", path: ["email"] },
      { message: "This field is invalid.", path: ["firstName"] },
      { message: "This field is invalid.", path: ["lastName"] },
    ]);
    expect(boundary.getLocale).toHaveBeenCalledOnce();
    expect(checkoutSession.saveContact).not.toHaveBeenCalled();
  });

  it("returns delivery schema failures with the invalid field paths", async () => {
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

    const result = await saveCheckoutDeliveryDetails(null, deliveryDetails);

    expect(result._tag).toBe("Failure");
    if (result._tag !== "Failure") {
      throw new Error("Expected Checkout Delivery Details validation to fail");
    }
    expect(result.failure.error._tag).toBe("InputInvalid");
    if (result.failure.error._tag !== "InputInvalid") {
      throw new Error("Expected an Action Input Invalid failure");
    }
    expect(result.failure.error.issues).toEqual([
      { message: "This field is invalid.", path: ["addressLine1"] },
      { message: "This field is invalid.", path: ["city"] },
      { message: "This field is invalid.", path: ["country"] },
      { message: "This field is invalid.", path: ["postalCode"] },
    ]);
    expect(checkoutSession.saveDeliveryDetails).not.toHaveBeenCalled();
  });

  it("returns typed mutation failures unchanged", async () => {
    checkoutSession.saveContact.mockImplementation(() =>
      Effect.fail(
        new CheckoutVersionConflict({
          cartId: CartId.make("cart-1"),
          message: "Checkout changed before Contact could be saved",
        })
      )
    );
    const contact = new FormData();
    contact.set("cartId", "cart-1");
    contact.set("source", "customerProfile");

    await expect(saveCheckoutContact(null, contact)).resolves.toEqual({
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
