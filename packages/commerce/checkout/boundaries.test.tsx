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
  requestLayer: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/i18n", () => ({
  getLocale: boundary.getLocale,
  getTranslations: async () => (key: string) => key,
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));
vi.mock("next/navigation", () => ({ notFound: boundary.notFound }));
vi.mock("../commerce-context/request", () => ({
  commerceRequestLayer: boundary.requestLayer,
}));

const checkoutState: CheckoutState = {
  scope: new StorefrontCustomerCheckoutScope({
    channel: "storefrontCustomer",
    locale: CommerceLocale.make("en-US"),
    customerId: CommerceCustomerId.make("customer-1"),
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key"),
  }),
  cart: {
    id: CartId.make("cart-1"),
    status: "active",
    storeKey: StoreKey.make("default-store"),
    lineItems: [
      {
        id: LineItemId.make("line-item-1"),
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
  },
  details: {},
  steps: [
    { id: "contact", status: "incomplete" },
    { id: "deliveryDetails", status: "incomplete" },
    { id: "shippingOptions", status: "incomplete" },
    { id: "paymentOptions", status: "incomplete" },
    { id: "reviewOrder", status: "incomplete" },
  ],
  activeStep: "contact",
  violations: [],
};

const shippingAddress = new AddressBookEntry({
  reference: AddressBookReference.make("office"),
  address: {
    addressLine1: "1 Hydra Way",
    postalCode: "10001",
    city: "New York",
    country: CountryCode.make("US"),
  },
  types: ["shipping"],
  defaultShipping: true,
  defaultBilling: false,
});

const checkoutSession = {
  getCurrent: vi.fn<() => Effect.Effect<CheckoutState, CheckoutUnavailable>>(
    () => Effect.succeed(checkoutState)
  ),
  saveContact: vi.fn(() => Effect.succeed(checkoutState)),
  saveDeliveryDetails: vi.fn(() => Effect.succeed({ state: checkoutState })),
};

const addressBook = {
  list: vi.fn(() => Effect.succeed([shippingAddress])),
  get: vi.fn(() => Effect.die("not used")),
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
  boundary.requestLayer.mockReset();
  boundary.requestLayer.mockImplementation(async () => checkoutLayer());
  boundary.revalidatePath.mockClear();
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

    expect(boundary.requestLayer).toHaveBeenCalledOnce();
    expect(page.props.state).toEqual(checkoutState);
    expect(page.props.shippingAddressOptions).toEqual([
      {
        reference: "office",
        address: shippingAddress.address,
        defaultShipping: true,
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
    expect(boundary.requestLayer).toHaveBeenCalledTimes(2);
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
