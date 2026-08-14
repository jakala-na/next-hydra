import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CountryCode } from "../domain/address";
import { AddressBookEntry, AddressBookReference } from "../domain/address-book";
import { CartId, LineItemId, ProductId, VariantId } from "../domain/cart";
import {
  type CheckoutState,
  CheckoutUnavailable,
  StorefrontCustomerCheckoutScope,
} from "../domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../domain/commerce-account";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import { AddressBook } from "../services/address-book";
import { CommerceLocale, StoreKey } from "../store";
import { saveCheckoutContact, saveCheckoutDeliveryDetails } from "./actions";
import { CheckoutPage } from "./checkout-page";

const boundary = vi.hoisted(() => ({
  getLocale: vi.fn(async () => "en-US" as const),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  provide: vi.fn(),
  revalidatePath: vi.fn(),
  runPromise: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/i18n", () => ({
  getLocale: boundary.getLocale,
  getTranslations: async () => (key: string) => key,
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));
vi.mock("next/navigation", () => ({ notFound: boundary.notFound }));
vi.mock("@repo/commerce/runtime", () => ({
  NextCommerce: {
    provide: boundary.provide,
    runPromise: boundary.runPromise,
  },
}));

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
  saveContact: vi.fn(() => Effect.succeed(checkoutState)),
  saveDeliveryDetails: vi.fn(() => Effect.succeed({ state: checkoutState })),
};

const addressBook = {
  get: vi.fn(() => Effect.die("not used")),
  list: vi.fn(() => Effect.succeed([shippingAddress])),
  save: vi.fn(() => Effect.die("not used")),
};

const checkoutLayer = () =>
  Layer.merge(
    Layer.succeed(CheckoutSession, checkoutSession),
    Layer.succeed(AddressBook, addressBook)
  );

beforeEach(() => {
  boundary.getLocale.mockClear();
  boundary.notFound.mockClear();
  boundary.provide.mockReset();
  boundary.provide.mockImplementation(
    (_locale) =>
      (
        program: Effect.Effect<unknown, unknown, AddressBook | CheckoutSession>
      ) =>
        program.pipe(Effect.provide(checkoutLayer()))
  );
  boundary.revalidatePath.mockClear();
  boundary.runPromise.mockReset();
  boundary.runPromise.mockImplementation(Effect.runPromise);
  checkoutSession.getCurrent.mockReset();
  checkoutSession.getCurrent.mockImplementation(() =>
    Effect.succeed(checkoutState)
  );
  checkoutSession.saveContact.mockClear();
  checkoutSession.saveDeliveryDetails.mockClear();
  addressBook.list.mockClear();
});

describe("Checkout boundaries", () => {
  it("loads Checkout and projects Shipping Address options", async () => {
    const page = await CheckoutPage({ locale: "en-US" });

    expect(boundary.provide).toHaveBeenCalledOnce();
    expect(page.props.state).toEqual(checkoutState);
    expect(page.props.shippingAddressOptions).toEqual([
      {
        address: shippingAddress.address,
        defaultShipping: true,
        reference: "office",
      },
    ]);
    expect(page.props.actions).toEqual({
      saveContact: saveCheckoutContact,
      saveDeliveryDetails: saveCheckoutDeliveryDetails,
    });
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

    await expect(CheckoutPage({ locale: "en-US" })).rejects.toThrow("notFound");
    expect(boundary.notFound).toHaveBeenCalledOnce();
  });

  it("runs each Checkout mutation with fresh request state and revalidates", async () => {
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

    const contactState = await saveCheckoutContact({ status: "idle" }, contact);
    const deliveryDetailsState = await saveCheckoutDeliveryDetails(
      { status: "idle" },
      deliveryDetails
    );

    expect(contactState).toEqual({ status: "success" });
    expect(deliveryDetailsState).toEqual({ status: "success" });
    expect(boundary.provide).toHaveBeenCalledTimes(2);
    expect(boundary.revalidatePath).toHaveBeenCalledTimes(2);
    expect(boundary.revalidatePath).toHaveBeenNthCalledWith(
      1,
      "/en-US/checkout"
    );
    expect(boundary.revalidatePath).toHaveBeenNthCalledWith(
      2,
      "/en-US/checkout"
    );
  });
});
