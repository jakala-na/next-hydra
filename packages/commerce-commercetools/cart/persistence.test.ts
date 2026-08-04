import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { AddressBookReference } from "@repo/commerce/domain/address-book";
import { CartId } from "@repo/commerce/domain/cart";
import {
  type CheckoutContact,
  type CheckoutDeliveryDetails,
  CountryCode,
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "@repo/commerce/domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import { CommerceLocale, StoreKey } from "@repo/commerce/store";
import type { Client } from "@urql/core";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCartPersistence } from "./persistence";
import type { CommercetoolsCart } from "./provider-cart";

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
    associateCarts,
    associateCartWithId,
    inBusinessUnit,
    mutation: vi.fn(),
    query: vi.fn(),
  };
});

vi.mock("./attributes", () => ({
  reshapeProductAttributes: vi.fn(),
}));

vi.mock("./price", () => ({
  productPriceFragment: {
    definitions: [],
    kind: "Document",
  },
  reshapePrice: vi.fn(),
}));

const activeCart = {
  businessUnit: {
    id: "business-unit-1",
  },
  cartState: "Active",
  country: null,
  custom: null,
  customerEmail: null,
  id: "cart-1",
  lineItems: [],
  shippingAddress: null,
  store: {
    key: "default-store",
  },
  totalLineItemQuantity: 0,
  totalPrice: {
    centAmount: 1000,
    currencyCode: "USD",
  },
  version: 1,
};

const customerScope = new StorefrontCustomerCheckoutScope({
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
  channel: "storefrontCustomer",
  customerId: CommerceCustomerId.make("customer-1"),
  locale: CommerceLocale.make("en-US"),
});

const anonymousScope = new StorefrontAnonymousCheckoutScope({
  anonymousCartId: CartId.make("cart-1"),
  channel: "storefrontAnonymous",
  locale: CommerceLocale.make("en-US"),
});

const checkoutCart = {
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  cartState: "Active",
  custom: null,
  customerEmail: null,
  id: "cart-1",
  lineItems: [],
  totalLineItemQuantity: 0,
  totalPrice: {
    centAmount: 1000,
    currencyCode: "USD",
  },
  version: 7,
} satisfies CommercetoolsCart;

const {
  addItemToCart,
  createCartForAssociateScope,
  findActiveCartsForAssociateScope,
  removeItemFromCart,
  saveCheckoutContact,
  saveCheckoutDeliveryDetails,
} = makeCartPersistence({
  apiRoot: {
    asAssociate: mocks.asAssociate,
  } as unknown as ByProjectKeyRequestBuilder,
  graphqlClient: {
    mutation: mocks.mutation,
    query: mocks.query,
  } as unknown as Pick<Client, "query" | "mutation">,
});

describe("Anonymous Cart updates", () => {
  it("resolves the Store distribution channel inside Cart persistence", async () => {
    mocks.query.mockResolvedValueOnce({
      data: {
        store: {
          distributionChannels: [{ key: "distribution-channel-1" }],
        },
      },
    });
    mocks.mutation.mockResolvedValueOnce({
      data: { updateCart: activeCart },
    });

    const result = await Effect.runPromise(
      addItemToCart({
        id: "cart-1",
        locale: "en-US",
        productId: "product-1",
        quantity: 1,
        storeKey: StoreKey.make("default-store"),
        variantId: 3,
        version: 1,
      })
    );

    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      storeKey: "default-store",
    });
    expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), {
      distributionChannelKey: "distribution-channel-1",
      id: "cart-1",
      locale: "en-US",
      productId: "product-1",
      quantity: 1,
      variantId: 3,
      version: 1,
    });
    expect(result).toMatchObject({ id: "cart-1" });
  });

  it("classifies documented add-line-item rejections as unavailable merchandise", async () => {
    const providerError = {
      graphQLErrors: [
        {
          extensions: { code: "MatchingPriceNotFound" },
        },
      ],
      message: "No matching price",
    };
    mocks.query.mockResolvedValueOnce({
      data: {
        store: {
          distributionChannels: [{ key: "distribution-channel-1" }],
        },
      },
    });
    mocks.mutation.mockResolvedValueOnce({ error: providerError });

    const error = await Effect.runPromise(
      addItemToCart({
        id: "cart-1",
        locale: "en-US",
        productId: "product-1",
        quantity: 1,
        storeKey: StoreKey.make("default-store"),
        variantId: 3,
        version: 1,
      }).pipe(Effect.flip)
    );

    expect(error).toMatchObject({
      _tag: "CommercetoolsCartMerchandiseUnavailable",
      cause: providerError,
    });
  });

  it("preserves an ambiguous add-line-item result as an unknown write outcome", async () => {
    const networkError = new Error("Connection closed after dispatch");
    mocks.query.mockResolvedValueOnce({
      data: {
        store: {
          distributionChannels: [{ key: "distribution-channel-1" }],
        },
      },
    });
    mocks.mutation.mockResolvedValueOnce({
      error: { message: networkError.message, networkError },
    });

    const error = await Effect.runPromise(
      addItemToCart({
        id: "cart-1",
        locale: "en-US",
        productId: "product-1",
        quantity: 1,
        storeKey: StoreKey.make("default-store"),
        variantId: 3,
        version: 1,
      }).pipe(Effect.flip)
    );

    expect(error._tag).toBe("CommercetoolsCartWriteOutcomeUnknown");
  });
});

const contact = {
  buyerContact: {
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  },
  source: "customerProfile",
} as const satisfies CheckoutContact;

const deliveryDetails = {
  shippingAddress: {
    addressLine1: "123 Analytical Engine Way",
    addressLine2: "Suite 2",
    city: "London",
    country: CountryCode.make("GB"),
    postalCode: "SW1A 1AA",
    region: "Greater London",
  },
  source: "manual",
} as const satisfies CheckoutDeliveryDetails;

const savedDeliveryDetails = {
  addressBookReference: AddressBookReference.make("london-office"),
  shippingAddress: deliveryDetails.shippingAddress,
  source: "addressBook",
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

    const result = await Effect.runPromise(
      createCartForAssociateScope({
        associateId: CommerceCustomerId.make("customer-1"),
        businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
        currency: "USD",
        customerId: CommerceCustomerId.make("customer-1"),
        locale: "en-US",
        storeKey: StoreKey.make("default-store"),
      })
    );

    expect(mocks.associateCartPost).toHaveBeenCalledWith({
      body: {
        currency: "USD",
        customerId: "customer-1",
        store: { key: "default-store", typeId: "store" },
      },
    });
    expect(result).toMatchObject({ id: "cart-1" });
  });
});

describe("findActiveCartsForAssociateScope", () => {
  it("finds Store Carts through the Business Unit associate boundary", async () => {
    mocks.query.mockResolvedValueOnce({
      data: {
        asAssociate: {
          carts: {
            results: [activeCart],
          },
        },
      },
    });

    const result = await Effect.runPromise(
      findActiveCartsForAssociateScope({
        associateId: CommerceCustomerId.make("customer-1"),
        businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
        locale: "en-US",
        storeKey: StoreKey.make("default-store"),
      })
    );

    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      associateId: "customer-1",
      businessUnitKey: "business-unit-key-1",
      locale: "en-US",
      where: 'cartState="Active" and store(key="default-store")',
    });
    expect(result[0]).toMatchObject({
      businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
      id: "cart-1",
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
          },
        },
      },
    });

    const result = await Effect.runPromise(
      findActiveCartsForAssociateScope({
        associateId: CommerceCustomerId.make("customer-1"),
        businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
        locale: "en-US",
        storeKey: StoreKey.make("default-store"),
      })
    );

    expect(result[0]).toMatchObject({
      checkoutDetails: {
        deliveryDetails: {
          addressBookReference: "london-office",
          shippingAddress: {
            addressLine1: "123 Analytical Engine Way",
            addressLine2: "Suite 2",
          },
          source: "addressBook",
        },
      },
    });
  });

  it("returns every active scoped Cart for CurrentCart selection", async () => {
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

    const result = await Effect.runPromise(
      findActiveCartsForAssociateScope({
        associateId: CommerceCustomerId.make("customer-1"),
        businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
        locale: "en-US",
        storeKey: StoreKey.make("default-store"),
      })
    );

    expect(result.map((cart) => cart.id)).toEqual(["cart-1", "cart-2"]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("preserves GraphQL failures instead of reporting that the Cart is missing", async () => {
    const graphqlError = {
      graphQLErrors: [
        {
          extensions: {
            code: "Forbidden",
          },
        },
      ],
      message: "Associate is not authorized",
    };
    mocks.query.mockResolvedValueOnce({
      error: graphqlError,
    });

    const error = await Effect.runPromise(
      findActiveCartsForAssociateScope({
        associateId: CommerceCustomerId.make("customer-1"),
        businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
        locale: "en-US",
        storeKey: StoreKey.make("default-store"),
      }).pipe(Effect.flip)
    );

    expect(error).toMatchObject({
      _tag: "CommercetoolsCartAccessDenied",
      cause: graphqlError,
    });
  });

  it("treats an unclassified GraphQL read failure as a defect", async () => {
    mocks.query.mockResolvedValueOnce({
      error: {
        graphQLErrors: [
          {
            extensions: { code: "InternalProviderContractViolation" },
          },
        ],
        message: "Unexpected provider response",
      },
    });

    await expect(
      Effect.runPromise(
        findActiveCartsForAssociateScope({
          associateId: CommerceCustomerId.make("customer-1"),
          businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
          locale: "en-US",
          storeKey: StoreKey.make("default-store"),
        })
      )
    ).rejects.toThrow("Unexpected provider response");
  });
});

describe("B2B Checkout Cart updates", () => {
  it("saves Contact through the associate and Business Unit boundary", async () => {
    mocks.associateCartPostExecute.mockResolvedValueOnce({
      body: {
        id: "cart-1",
      },
    });

    const result = await Effect.runPromise(
      saveCheckoutContact({
        cart: checkoutCart,
        contact,
        locale: "en-US",
        scope: customerScope,
      })
    );

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
    expect(result).toBeUndefined();
  });

  it("copies a saved Shipping Address through the associate and Business Unit boundary", async () => {
    mocks.associateCartPostExecute.mockResolvedValueOnce({
      body: {
        id: "cart-1",
      },
    });

    const result = await Effect.runPromise(
      saveCheckoutDeliveryDetails({
        cart: checkoutCart,
        deliveryDetails: savedDeliveryDetails,
        locale: "en-US",
        scope: customerScope,
      })
    );

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
    expect(result).toBeUndefined();
  });

  it("copies a Manual Shipping Address into an anonymous Cart", async () => {
    mocks.mutation.mockResolvedValueOnce({
      data: { updateCart: { id: "cart-1" } },
    });
    const result = await Effect.runPromise(
      saveCheckoutDeliveryDetails({
        cart: checkoutCart,
        deliveryDetails,
        locale: "en-US",
        scope: anonymousScope,
      })
    );

    expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), {
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
      id: "cart-1",
      locale: "en-US",
      version: 7,
    });
    expect(result).toBeUndefined();
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

    const result = await Effect.runPromise(
      saveCheckoutDeliveryDetails({
        cart: checkoutCart,
        deliveryDetails,
        locale: "en-US",
        scope: anonymousScope,
      })
    );

    expect(result).toBeUndefined();
    expect(mocks.mutation).toHaveBeenCalledTimes(2);
    expect(mocks.mutation.mock.calls[1]?.[1]).toMatchObject({ version: 8 });
  });

  it("preserves an anonymous setCustomType conflict for Carts Layer recovery", async () => {
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

    const error = await Effect.runPromise(
      saveCheckoutContact({
        cart: checkoutCart,
        contact,
        locale: "en-US",
        retryConcurrentModification: true,
        scope: anonymousScope,
      }).pipe(Effect.flip)
    );

    expect(error).toMatchObject({
      _tag: "CommercetoolsCartVersionConflict",
    });
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
  });

  it("retries anonymous setCustomField Contact with the provider version", async () => {
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

    const result = await Effect.runPromise(
      saveCheckoutContact({
        cart: {
          ...checkoutCart,
          custom: {
            customFieldsRaw: [],
            type: { key: "orderCustomFields" },
          },
        },
        contact,
        locale: "en-US",
        retryConcurrentModification: true,
        scope: anonymousScope,
      })
    );

    expect(result).toBeUndefined();
    expect(mocks.mutation).toHaveBeenCalledTimes(2);
    expect(mocks.mutation.mock.calls[1]?.[1]).toMatchObject({ version: 8 });
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
            lineItems: [],
            version: providerCurrentVersion,
          },
        },
      });

    const result = await Effect.runPromise(
      removeItemFromCart({
        id: activeCart.id,
        lineItemId: "line-1",
        locale: "en-US",
        version: activeCart.version,
      })
    );

    expect(result).toMatchObject({
      lineItems: [],
      version: providerCurrentVersion,
    });
    expect(mocks.mutation).toHaveBeenCalledTimes(2);
    expect(mocks.mutation.mock.calls[1]?.[1]).toMatchObject({
      version: providerCurrentVersion,
    });
  });

  it("retries the same narrow Delivery action with the provider current version", async () => {
    const providerCurrentVersion = checkoutCart.version + 1;
    const conflict = Object.assign(new Error("Concurrent modification"), {
      body: {
        errors: [
          {
            code: "ConcurrentModification",
            currentVersion: providerCurrentVersion,
          },
        ],
      },
      statusCode: 409,
    });
    mocks.associateCartPostExecute
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ body: { id: "cart-1" } });

    const result = await Effect.runPromise(
      saveCheckoutDeliveryDetails({
        cart: checkoutCart,
        deliveryDetails,
        locale: "en-US",
        scope: customerScope,
      })
    );
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

    expect(result).toBeUndefined();
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
      body: {
        errors: [
          {
            code: "ConcurrentModification",
            currentVersion: checkoutCart.version + 1,
          },
        ],
      },
      statusCode: 409,
    });
    mocks.associateCartPostExecute.mockRejectedValueOnce(conflict);

    const error = await Effect.runPromise(
      saveCheckoutContact({
        cart: checkoutCart,
        contact,
        locale: "en-US",
        scope: customerScope,
      }).pipe(Effect.flip)
    );

    expect(error).toMatchObject({
      _tag: "CommercetoolsCartVersionConflict",
      cause: conflict,
    });
    expect(mocks.associateCartPost).toHaveBeenCalledTimes(1);
  });

  it("keeps an exhausted associate Cart version conflict in the error channel", async () => {
    const providerCurrentVersion = checkoutCart.version + 1;
    const initialConflict = Object.assign(
      new Error("Concurrent modification"),
      {
        body: {
          errors: [
            {
              code: "ConcurrentModification",
              currentVersion: providerCurrentVersion,
            },
          ],
        },
        statusCode: 409,
      }
    );
    const retryConflict = Object.assign(
      new Error("Concurrent modification after retry"),
      {
        code: "ConcurrentModification",
        currentVersion: providerCurrentVersion + 1,
        statusCode: 409,
      }
    );
    mocks.associateCartPostExecute
      .mockRejectedValueOnce(initialConflict)
      .mockRejectedValueOnce(retryConflict);

    const error = await Effect.runPromise(
      saveCheckoutDeliveryDetails({
        cart: checkoutCart,
        deliveryDetails,
        locale: "en-US",
        scope: customerScope,
      }).pipe(Effect.flip)
    );

    expect(error).toMatchObject({
      _tag: "CommercetoolsCartVersionConflict",
      cause: retryConflict,
    });
    expect(mocks.associateCartPost).toHaveBeenCalledTimes(2);
  });
});
