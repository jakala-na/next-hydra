import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddressBookReference } from "../../domain/address-book";
import { CartId, StoreKey } from "../../domain/cart";
import {
  type CheckoutContact,
  type CheckoutDeliveryDetails,
  CheckoutLocale,
  CountryCode,
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "../../domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../../domain/commerce-account";
import type { Cart } from "../types";
import { domainError } from "../utils/errors";
import {
  createCartForAssociateScope,
  getActiveCartForAssociateScope,
  removeItemFromCart,
  saveCheckoutContact,
  saveCheckoutDeliveryDetails,
} from "./cart.repo";

const mocks = vi.hoisted(() => {
  const associateCartPostExecute = vi.fn();
  const associateCartPost = vi.fn(() => ({
    execute: associateCartPostExecute,
  }));
  const associateCartWithId = vi.fn(() => ({
    post: associateCartPost,
  }));
  const associateCarts = vi.fn(() => ({
    post: associateCartPost,
    withId: associateCartWithId,
  }));
  const inBusinessUnit = vi.fn(() => ({
    carts: associateCarts,
  }));
  const associateById = vi.fn(() => ({
    inBusinessUnitKeyWithBusinessUnitKeyValue: inBusinessUnit,
  }));
  const asAssociate = vi.fn(() => ({
    withAssociateIdValue: associateById,
  }));

  return {
    asAssociate,
    associateById,
    associateCartPost,
    associateCartPostExecute,
    associateCartWithId,
    associateCarts,
    inBusinessUnit,
    mutation: vi.fn(),
    query: vi.fn(),
  };
});

vi.mock("../client/graphql-client", () => ({
  graphqlClient: () => ({
    mutation: mocks.mutation,
    query: mocks.query,
  }),
}));

vi.mock("../client/api-root", () => ({
  apiRoot: {
    asAssociate: mocks.asAssociate,
  },
}));

vi.mock("../product/mappers/attributes", () => ({
  reshapeProductAttributes: vi.fn(),
}));

vi.mock("../product/mappers/price", () => ({
  productPriceFragment: {
    kind: "Document",
    definitions: [],
  },
  reshapePrice: vi.fn(),
}));

const activeCart = {
  id: "cart-1",
  version: 1,
  country: null,
  customerEmail: null,
  shippingAddress: null,
  store: {
    key: "default-store",
  },
  businessUnit: {
    id: "business-unit-1",
  },
  custom: null,
  lineItems: [],
  totalLineItemQuantity: 0,
  totalPrice: {
    currencyCode: "USD",
    centAmount: 1000,
  },
  cartState: "Active",
};

const customerScope = new StorefrontCustomerCheckoutScope({
  channel: "storefrontCustomer",
  locale: CheckoutLocale.make("en-US"),
  customerId: CommerceCustomerId.make("customer-1"),
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
});

const anonymousScope = new StorefrontAnonymousCheckoutScope({
  channel: "storefrontAnonymous",
  locale: CheckoutLocale.make("en-US"),
  anonymousCartId: CartId.make("cart-1"),
});

const checkoutCart = {
  id: "cart-1",
  version: 7,
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  customerEmail: null,
  custom: null,
  lineItems: [],
  totalLineItemQuantity: 0,
  totalPrice: {
    currencyCode: "USD",
    centAmount: 1000,
  },
  cartState: "Active",
} satisfies Cart;

const contact = {
  source: "customerProfile",
  buyerContact: {
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  },
} as const satisfies CheckoutContact;

const deliveryDetails = {
  source: "manual",
  shippingAddress: {
    addressLine1: "123 Analytical Engine Way",
    addressLine2: "Suite 2",
    postalCode: "SW1A 1AA",
    city: "London",
    country: CountryCode.make("GB"),
    region: "Greater London",
  },
} as const satisfies CheckoutDeliveryDetails;

const savedDeliveryDetails = {
  source: "addressBook",
  addressBookReference: AddressBookReference.make("london-office"),
  shippingAddress: deliveryDetails.shippingAddress,
} as const satisfies CheckoutDeliveryDetails;

beforeEach(() => {
  mocks.query.mockReset();
  mocks.mutation.mockReset();
  mocks.asAssociate.mockClear();
  mocks.associateById.mockClear();
  mocks.inBusinessUnit.mockClear();
  mocks.associateCarts.mockClear();
  mocks.associateCartWithId.mockClear();
  mocks.associateCartPost.mockClear();
  mocks.associateCartPostExecute.mockReset();
});

describe("createCartForAssociateScope", () => {
  it("creates the Cart through the Business Unit associate boundary", async () => {
    mocks.associateCartPostExecute.mockResolvedValueOnce({
      body: { id: "cart-1" },
    });
    mocks.query.mockResolvedValueOnce({ data: { cart: activeCart } });

    const result = await createCartForAssociateScope({
      associateId: CommerceCustomerId.make("customer-1"),
      businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
      customerId: CommerceCustomerId.make("customer-1"),
      storeKey: StoreKey.make("default-store"),
      locale: "en-US",
      currency: "USD",
    });

    expect(mocks.associateCartPost).toHaveBeenCalledWith({
      body: {
        currency: "USD",
        customerId: "customer-1",
        store: { key: "default-store", typeId: "store" },
      },
    });
    expect(result).toMatchObject({ ok: true, data: { id: "cart-1" } });
  });
});

describe("getActiveCartForAssociateScope", () => {
  it("selects the Store Cart through the Business Unit associate boundary", async () => {
    mocks.query.mockResolvedValueOnce({
      data: {
        asAssociate: {
          carts: {
            results: [activeCart],
          },
        },
      },
    });

    const result = await getActiveCartForAssociateScope({
      associateId: CommerceCustomerId.make("customer-1"),
      businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
      storeKey: StoreKey.make("default-store"),
      locale: "en-US",
    });

    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      associateId: "customer-1",
      businessUnitKey: "business-unit-key-1",
      where: 'cartState="Active" and store(key="default-store")',
      locale: "en-US",
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: "cart-1",
        businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
      },
    });
  });

  it("resolves saved-address identity from the copied Shipping Address", async () => {
    mocks.query.mockResolvedValueOnce({
      data: {
        asAssociate: {
          carts: {
            results: [
              {
                ...activeCart,
                shippingAddress: {
                  key: "address-book-bG9uZG9uLW9mZmljZQ",
                  streetName: "123 Analytical Engine Way",
                  additionalStreetInfo: "Suite 2",
                  postalCode: "SW1A 1AA",
                  city: "London",
                  country: "GB",
                  region: "Greater London",
                },
              },
            ],
          },
        },
      },
    });

    const result = await getActiveCartForAssociateScope({
      associateId: CommerceCustomerId.make("customer-1"),
      businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
      storeKey: StoreKey.make("default-store"),
      locale: "en-US",
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        checkoutDetails: {
          deliveryDetails: {
            source: "addressBook",
            addressBookReference: "london-office",
            shippingAddress: {
              addressLine1: "123 Analytical Engine Way",
              addressLine2: "Suite 2",
            },
          },
        },
      },
    });
  });

  it("fails instead of choosing arbitrarily when multiple active scoped Carts exist", async () => {
    mocks.query.mockResolvedValueOnce({
      data: {
        asAssociate: {
          carts: {
            results: [
              activeCart,
              {
                ...activeCart,
                id: "cart-2",
              },
            ],
          },
        },
      },
    });

    const result = await getActiveCartForAssociateScope({
      associateId: CommerceCustomerId.make("customer-1"),
      businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
      storeKey: StoreKey.make("default-store"),
      locale: "en-US",
    });

    expect(result).toEqual({
      ok: false,
      error: domainError(
        "CONFLICT",
        "Multiple active Carts are available for the Store and Business Unit"
      ),
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("preserves GraphQL failures instead of reporting that the Cart is missing", async () => {
    const graphqlError = {
      message: "Associate is not authorized",
      graphQLErrors: [
        {
          extensions: {
            code: "Forbidden",
          },
        },
      ],
    };
    mocks.query.mockResolvedValueOnce({
      error: graphqlError,
    });

    const result = await getActiveCartForAssociateScope({
      associateId: CommerceCustomerId.make("customer-1"),
      businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
      storeKey: StoreKey.make("default-store"),
      locale: "en-US",
    });

    expect(result).toEqual({
      ok: false,
      error: domainError(
        "UNKNOWN",
        "Failed to get active Cart for Store and Business Unit: Associate is not authorized",
        undefined,
        graphqlError
      ),
    });
  });
});

describe("B2B Checkout Cart updates", () => {
  it("saves Contact through the associate and Business Unit boundary", async () => {
    mocks.associateCartPostExecute.mockResolvedValueOnce({
      body: {
        id: "cart-1",
      },
    });

    const result = await saveCheckoutContact({
      cart: checkoutCart,
      contact,
      locale: "en-US",
      scope: customerScope,
    });

    expect(mocks.associateById).toHaveBeenCalledWith({
      associateId: "customer-1",
    });
    expect(mocks.inBusinessUnit).toHaveBeenCalledWith({
      businessUnitKey: "business-unit-key-1",
    });
    expect(mocks.associateCartWithId).toHaveBeenCalledWith({
      ID: "cart-1",
    });
    expect(mocks.associateCartPost).toHaveBeenCalledWith({
      body: {
        actions: [
          {
            action: "setCustomerEmail",
            email: "ada@example.com",
          },
          {
            action: "setCustomType",
            fields: {
              checkoutContact: JSON.stringify(contact),
            },
            type: {
              key: "orderCustomFields",
              typeId: "type",
            },
          },
        ],
        version: 7,
      },
    });
    expect(result).toEqual({
      ok: true,
      data: undefined,
    });
  });

  it("copies a saved Shipping Address through the associate and Business Unit boundary", async () => {
    mocks.associateCartPostExecute.mockResolvedValueOnce({
      body: {
        id: "cart-1",
      },
    });

    const result = await saveCheckoutDeliveryDetails({
      cart: checkoutCart,
      deliveryDetails: savedDeliveryDetails,
      locale: "en-US",
      scope: customerScope,
    });

    expect(mocks.associateCartPost).toHaveBeenCalledWith({
      body: {
        actions: [
          {
            action: "setShippingAddress",
            address: {
              additionalStreetInfo: "Suite 2",
              city: "London",
              country: "GB",
              key: "address-book-bG9uZG9uLW9mZmljZQ",
              postalCode: "SW1A 1AA",
              region: "Greater London",
              streetName: "123 Analytical Engine Way",
            },
          },
        ],
        version: 7,
      },
    });
    expect(result).toEqual({
      ok: true,
      data: undefined,
    });
  });

  it("copies a Manual Shipping Address into an anonymous Cart", async () => {
    mocks.mutation.mockResolvedValueOnce({
      data: { updateCart: { id: "cart-1" } },
    });
    const result = await saveCheckoutDeliveryDetails({
      cart: checkoutCart,
      deliveryDetails,
      locale: "en-US",
      scope: anonymousScope,
    });

    expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), {
      id: "cart-1",
      version: 7,
      locale: "en-US",
      actions: [
        {
          setShippingAddress: {
            address: {
              additionalStreetInfo: "Suite 2",
              city: "London",
              country: "GB",
              postalCode: "SW1A 1AA",
              region: "Greater London",
              streetName: "123 Analytical Engine Way",
            },
          },
        },
      ],
    });
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("retries an anonymous narrow Delivery action with the GraphQL provider version", async () => {
    mocks.mutation
      .mockResolvedValueOnce({
        error: {
          graphQLErrors: [
            {
              extensions: {
                code: "ConcurrentModification",
                currentVersion: 8,
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: { updateCart: { id: "cart-1" } },
      });

    const result = await saveCheckoutDeliveryDetails({
      cart: checkoutCart,
      deliveryDetails,
      locale: "en-US",
      scope: anonymousScope,
    });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.mutation).toHaveBeenCalledTimes(2);
    expect(mocks.mutation.mock.calls[1]?.[1]).toMatchObject({ version: 8 });
  });

  it("leaves anonymous setCustomType conflict resolution to Checkout orchestration", async () => {
    mocks.mutation.mockResolvedValueOnce({
      error: {
        graphQLErrors: [
          {
            extensions: {
              code: "ConcurrentModification",
              currentVersion: 8,
            },
          },
        ],
      },
    });

    const result = await saveCheckoutContact({
      cart: checkoutCart,
      contact,
      locale: "en-US",
      scope: anonymousScope,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
  });

  it("retries anonymous line-item removal with the provider version", async () => {
    const providerCurrentVersion = activeCart.version + 1;
    mocks.mutation
      .mockResolvedValueOnce({
        error: {
          graphQLErrors: [
            {
              extensions: {
                code: "ConcurrentModification",
                currentVersion: providerCurrentVersion,
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          updateCart: {
            ...activeCart,
            version: providerCurrentVersion,
            lineItems: [],
          },
        },
      });

    const result = await removeItemFromCart({
      id: activeCart.id,
      version: activeCart.version,
      lineItemId: "line-1",
      locale: "en-US",
    });

    expect(result).toMatchObject({
      ok: true,
      data: { version: providerCurrentVersion, lineItems: [] },
    });
    expect(mocks.mutation).toHaveBeenCalledTimes(2);
    expect(mocks.mutation.mock.calls[1]?.[1]).toMatchObject({
      version: providerCurrentVersion,
    });
  });

  it("retries the same narrow Delivery action with the provider current version", async () => {
    const providerCurrentVersion = checkoutCart.version + 1;
    const conflict = Object.assign(new Error("Concurrent modification"), {
      statusCode: 409,
      body: {
        errors: [
          {
            code: "ConcurrentModification",
            currentVersion: providerCurrentVersion,
          },
        ],
      },
    });
    mocks.associateCartPostExecute
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ body: { id: "cart-1" } });

    const result = await saveCheckoutDeliveryDetails({
      cart: checkoutCart,
      deliveryDetails,
      locale: "en-US",
      scope: customerScope,
    });
    const expectedActions = [
      {
        action: "setShippingAddress",
        address: {
          additionalStreetInfo: "Suite 2",
          city: "London",
          country: "GB",
          postalCode: "SW1A 1AA",
          region: "Greater London",
          streetName: "123 Analytical Engine Way",
        },
      },
    ];

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mocks.associateCartPost).toHaveBeenCalledTimes(2);
    expect(mocks.associateCartPost).toHaveBeenNthCalledWith(1, {
      body: { actions: expectedActions, version: checkoutCart.version },
    });
    expect(mocks.associateCartPost).toHaveBeenNthCalledWith(2, {
      body: { actions: expectedActions, version: providerCurrentVersion },
    });
  });

  it("does not retry setCustomType after a Cart version conflict", async () => {
    const conflict = Object.assign(new Error("Concurrent modification"), {
      statusCode: 409,
      body: {
        errors: [
          {
            code: "ConcurrentModification",
            currentVersion: checkoutCart.version + 1,
          },
        ],
      },
    });
    mocks.associateCartPostExecute.mockRejectedValueOnce(conflict);

    const result = await saveCheckoutContact({
      cart: checkoutCart,
      contact,
      locale: "en-US",
      scope: customerScope,
    });

    expect(result).toEqual({
      ok: false,
      error: domainError(
        "CONFLICT",
        "Checkout Cart changed before Contact could be saved",
        undefined,
        conflict
      ),
    });
    expect(mocks.associateCartPost).toHaveBeenCalledTimes(1);
  });

  it("keeps an exhausted associate Cart version conflict in the error channel", async () => {
    const providerCurrentVersion = checkoutCart.version + 1;
    const initialConflict = Object.assign(
      new Error("Concurrent modification"),
      {
        statusCode: 409,
        body: {
          errors: [
            {
              code: "ConcurrentModification",
              currentVersion: providerCurrentVersion,
            },
          ],
        },
      }
    );
    const retryConflict = Object.assign(
      new Error("Concurrent modification after retry"),
      {
        code: "ConcurrentModification",
        statusCode: 409,
        currentVersion: providerCurrentVersion + 1,
      }
    );
    mocks.associateCartPostExecute
      .mockRejectedValueOnce(initialConflict)
      .mockRejectedValueOnce(retryConflict);

    const result = await saveCheckoutDeliveryDetails({
      cart: checkoutCart,
      deliveryDetails,
      locale: "en-US",
      scope: customerScope,
    });

    expect(result).toEqual({
      ok: false,
      error: domainError(
        "CONFLICT",
        "Checkout Cart changed before Delivery Details could be saved",
        undefined,
        retryConflict
      ),
    });
    expect(mocks.associateCartPost).toHaveBeenCalledTimes(2);
  });
});
