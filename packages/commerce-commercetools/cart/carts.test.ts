import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { describe, expect, it } from "@effect/vitest";
import {
  CartId,
  LineItemId,
  ProductId,
  VariantId,
} from "@repo/commerce/domain/cart";
import { CountryCode } from "@repo/commerce/domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import {
  DeliveryGroupReference,
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
  ShippingOptionReference,
} from "@repo/commerce/domain/delivery-plan";
import { Carts } from "@repo/commerce/services/carts";
import { CommerceLocale, Store, StoreKey } from "@repo/commerce/store";
import type { Client } from "@urql/core";
import { Cause, Effect, Exit, Layer, Option } from "effect";

import { CommercetoolsGraphQLClient } from "../client/graphql-client";
import { CommercetoolsRestClient } from "../client/rest-client";
import {
  deliveryAddressKeyFor,
  shippingKeyFor,
} from "../delivery-planning/references";
import { cartsLayer } from "./carts";

type ScriptedResponse = {
  readonly data?: unknown;
  readonly error?: unknown;
};

type GraphqlDocument = {
  readonly definitions?: readonly {
    readonly name?: { readonly value?: string };
  }[];
};

type GraphqlVariables = Parameters<Client["query"]>[1];

type RecordedCall = {
  readonly operation: string;
  readonly variables: GraphqlVariables;
};

const operationName = (document: GraphqlDocument): string =>
  document.definitions?.[0]?.name?.value ?? "unknown";

const makeScriptedClients = (apiRoot?: ByProjectKeyRequestBuilder) => {
  const queues = new Map<string, ScriptedResponse[]>();
  const sticky = new Map<string, ScriptedResponse>();
  const calls: RecordedCall[] = [];

  // The urql query/mutation contract returns a thenable; this double resolves each scripted
  // response synchronously but must hand back a Promise so persistence can await it.
  // oxlint-disable-next-line typescript/promise-function-async
  const respond = (
    document: GraphqlDocument,
    variables: GraphqlVariables
  ): Promise<ScriptedResponse> => {
    const operation = operationName(document);
    calls.push({ operation, variables });
    const next = queues.get(operation)?.shift();
    if (next !== undefined) {
      sticky.set(operation, next);
      return Promise.resolve(next);
    }
    const last = sticky.get(operation);
    if (last === undefined) {
      throw new Error(`No scripted response for operation ${operation}`);
    }
    return Promise.resolve(last);
  };

  const on = (operation: string, ...responses: readonly ScriptedResponse[]) => {
    queues.set(operation, [...(queues.get(operation) ?? []), ...responses]);
  };

  const callsFor = (operation: string) =>
    calls.filter((call) => call.operation === operation);

  // SAFETY: Cart persistence only awaits query/mutation and reads `data`/`error`; the scripted
  // Promise models the entire consumed contract, and the associate REST root stays unused here.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
  const graphqlClient = {
    mutation: respond,
    query: respond,
  } as unknown as Pick<Client, "mutation" | "query">;
  // SAFETY: These cases exercise only the GraphQL client; the associate REST root is never called.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
  const unusedApiRoot = {} as ByProjectKeyRequestBuilder;

  const layer = cartsLayer.pipe(
    Layer.provide(
      Layer.mergeAll(
        CommercetoolsGraphQLClient.testLayer(graphqlClient),
        CommercetoolsRestClient.testLayer(apiRoot ?? unusedApiRoot)
      )
    )
  );

  return { callsFor, layer, on };
};

const store = new Store({
  currency: "USD",
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("us-store"),
});

const anonymousTarget = {
  _tag: "AnonymousCartTarget" as const,
  id: CartId.make("cart-1"),
  store,
};

const currentVersion = 7;
const providerVersion = 8;
const unitPriceCentAmount = 2500;

const rawActiveCart = {
  billingAddress: null,
  businessUnit: null,
  cartState: "Active",
  country: null,
  custom: null,
  customerEmail: null,
  id: "cart-1",
  lineItems: [],
  shippingAddress: null,
  shippingMode: "Multiple",
  store: { key: "us-store" },
  totalLineItemQuantity: 0,
  totalPrice: { centAmount: 0, currencyCode: "USD" },
  version: currentVersion,
};

const rawPaymentBillingAddress = {
  additionalStreetInfo: null,
  city: "New York",
  country: "US",
  key: null,
  postalCode: "10001",
  region: null,
  state: "NY",
  streetName: "1 Payment Way",
};

const rawPreparedCardPayment = {
  amountPlanned: { centAmount: 2500, currencyCode: "USD" },
  custom: {
    customFieldsRaw: [
      {
        name: "checkoutPlacementAttemptReference",
        value: "attempt-1",
      },
    ],
    type: { key: "checkoutPaymentFields" },
  },
  id: "payment-1",
  interfaceId: "pi-1",
  key: "checkout-card-cart-1",
  paymentMethodInfo: {
    method: "card",
    paymentInterface: "Stripe",
    token: { value: "confirmation-1" },
  },
};

const rawCartLineItem = {
  id: "line-1",
  key: null,
  name: "Hydra Crane",
  price: {
    discounted: null,
    value: { centAmount: unitPriceCentAmount, currencyCode: "USD" },
  },
  productId: "product-1",
  productType: { key: "heavy-lifting-and-specialized-equipment" },
  quantity: 1,
  totalPrice: { centAmount: unitPriceCentAmount, currencyCode: "USD" },
  variant: {
    attributesRaw: [],
    id: 3,
    images: [{ label: "Crane", url: "https://example.com/crane.jpg" }],
    sku: "SKU-3",
  },
};

const rawCartWithLineItem = {
  ...rawActiveCart,
  lineItems: [rawCartLineItem],
  totalLineItemQuantity: 1,
  totalPrice: { centAmount: unitPriceCentAmount, currencyCode: "USD" },
};

const selectedDeliveryPlan = {
  groups: [
    {
      reference: DeliveryGroupReference.make("delivery-1"),
      selectedShippingOption: {
        name: "Standard",
        price: { centAmount: 500, currencyCode: "USD" as const },
        reference: ShippingOptionReference.make(
          "shipping-option-c2hpcHBpbmctbWV0aG9kLTE"
        ),
      },
      shippingAddress: {
        addressLine1: "1 Hydra Way",
        city: "New York",
        country: CountryCode.make("US"),
        postalCode: "10001",
      },
      targets: [{ lineItemId: LineItemId.make("line-1"), quantity: 1 }],
    },
  ],
  quoteReference: DeliveryPlanQuoteReference.make("quote-1"),
  reference: DeliveryPlanReference.make("plan-1"),
} as const;

const rawBusinessUnitCart = {
  ...rawActiveCart,
  businessUnit: { id: "business-unit-1" },
};

const cartByIdData = <Cart>(cart: Cart) => ({ data: { cart } });
const distributionChannelData = {
  data: {
    store: { distributionChannels: [{ key: "distribution-channel-1" }] },
  },
};
const updateCartData = <Cart>(cart: Cart) => ({ data: { updateCart: cart } });
const forbidden = {
  error: {
    graphQLErrors: [{ extensions: { code: "Forbidden" } }],
    message: "Associate is not authorized",
  },
};
const concurrentModification = (currentProviderVersion: number) => ({
  error: {
    graphQLErrors: [
      {
        extensions: {
          code: "ConcurrentModification",
          currentVersion: currentProviderVersion,
        },
      },
    ],
  },
});

const associateScopeInput = {
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
  customerId: CommerceCustomerId.make("customer-1"),
  store,
} as const;

describe("findById", () => {
  it.effect(
    "projects an owned provider Cart without leaking its version",
    () => {
      const clients = makeScriptedClients();
      clients.on("CartById", cartByIdData(rawActiveCart));

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const found = yield* carts.findById({
          id: CartId.make("cart-1"),
          store,
        });
        const cart = Option.getOrThrow(found);

        expect(cart).not.toHaveProperty("version");
        expect(cart).toMatchObject({
          id: "cart-1",
          status: "active",
          storeKey: "us-store",
        });
      }).pipe(Effect.provide(clients.layer));
    }
  );

  it.effect("projects provider line-item variant identity", () => {
    const clients = makeScriptedClients();
    clients.on("CartById", cartByIdData(rawCartWithLineItem));

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const found = yield* carts.findById({ id: CartId.make("cart-1"), store });
      const cart = Option.getOrThrow(found);

      expect(cart.lineItems[0]?.variant).toMatchObject({
        id: "3",
        productId: "product-1",
        sku: "SKU-3",
      });
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect("distinguishes confirmed absence from provider failure", () => {
    const clients = makeScriptedClients();
    clients.on("CartById", cartByIdData(null));

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const found = yield* carts.findById({
        id: CartId.make("missing"),
        store,
      });
      expect(Option.isNone(found)).toBeTruthy();
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect("reports invalid provider projections as invalid data", () => {
    const clients = makeScriptedClients();
    clients.on(
      "CartById",
      cartByIdData({ ...rawActiveCart, totalLineItemQuantity: -1 })
    );

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .findById({ id: CartId.make("cart-1"), store })
        .pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: "CartProviderFailure",
        reason: "invalidData",
      });
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect(
    "projects a prepared Payment from the linked Payment object",
    () => {
      const clients = makeScriptedClients();
      clients.on(
        "CartById",
        cartByIdData({
          ...rawActiveCart,
          billingAddress: rawPaymentBillingAddress,
          paymentInfo: {
            paymentRefs: [{ id: "payment-1" }],
            payments: [rawPreparedCardPayment],
          },
        })
      );

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const found = yield* carts.findById({
          id: CartId.make("cart-1"),
          store,
        });

        expect(
          Option.getOrThrow(found).checkoutDetails.preparedPayment
        ).toEqual({
          amount: { centAmount: 2500, currencyCode: "USD" },
          attemptReference: "attempt-1",
          billingAddress: {
            addressLine1: "1 Payment Way",
            city: "New York",
            country: "US",
            postalCode: "10001",
            region: "NY",
          },
          method: "card",
          paymentReference: "payment-1",
          preparationReference: "checkout-card-cart-1:USD:2500",
        });
      }).pipe(Effect.provide(clients.layer));
    }
  );

  it.effect(
    "projects a selected Card Payment without reading its masked token",
    () => {
      const clients = makeScriptedClients();
      clients.on(
        "CartById",
        cartByIdData({
          ...rawActiveCart,
          billingAddress: rawPaymentBillingAddress,
          paymentInfo: {
            paymentRefs: [{ id: "payment-1" }],
            payments: [
              {
                ...rawPreparedCardPayment,
                custom: {
                  customFieldsRaw: [
                    {
                      name: "checkoutPlacementAttemptReference",
                      value: "attempt-1",
                    },
                  ],
                  type: { key: "checkoutPaymentFields" },
                },
                paymentMethodInfo: {
                  method: "card",
                  paymentInterface: "Stripe",
                },
              },
            ],
          },
        })
      );

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const found = yield* carts.findById({
          id: CartId.make("cart-1"),
          store,
        });

        expect(
          Option.getOrThrow(found).checkoutDetails.preparedPayment
        ).toMatchObject({
          method: "card",
          paymentReference: "payment-1",
        });
      }).pipe(Effect.provide(clients.layer));
    }
  );

  it.effect(
    "projects Net Terms assertions from the linked Payment object",
    () => {
      const clients = makeScriptedClients();
      clients.on(
        "CartById",
        cartByIdData({
          ...rawActiveCart,
          billingAddress: rawPaymentBillingAddress,
          paymentInfo: {
            paymentRefs: [{ id: "net-terms-payment-1" }],
            payments: [
              {
                amountPlanned: { centAmount: 2500, currencyCode: "USD" },
                custom: {
                  customFieldsRaw: [
                    {
                      name: "checkoutPlacementAttemptReference",
                      value: "attempt-1",
                    },
                    { name: "checkoutTermsInDays", value: 30 },
                  ],
                  type: { key: "checkoutPaymentFields" },
                },
                id: "net-terms-payment-1",
                interfaceId: "checkout-net-terms-cart-1",
                key: "checkout-net-terms-cart-1",
                paymentMethodInfo: {
                  method: "netTerms",
                  paymentInterface: "erp-credit",
                },
              },
            ],
          },
        })
      );

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const found = yield* carts.findById({
          id: CartId.make("cart-1"),
          store,
        });

        expect(
          Option.getOrThrow(found).checkoutDetails.preparedPayment
        ).toEqual({
          amount: { centAmount: 2500, currencyCode: "USD" },
          attemptReference: "attempt-1",
          billingAddress: {
            addressLine1: "1 Payment Way",
            city: "New York",
            country: "US",
            postalCode: "10001",
            region: "NY",
          },
          method: "netTerms",
          paymentReference: "net-terms-payment-1",
          termsInDays: 30,
        });
      }).pipe(Effect.provide(clients.layer));
    }
  );

  it.effect("ignores a Cart with an incompatible linked Payment", () => {
    const clients = makeScriptedClients();
    clients.on(
      "CartById",
      cartByIdData({
        ...rawActiveCart,
        billingAddress: rawPaymentBillingAddress,
        paymentInfo: {
          paymentRefs: [{ id: "payment-1" }],
          payments: [
            {
              ...rawPreparedCardPayment,
              custom: {
                ...rawPreparedCardPayment.custom,
                type: { key: "anotherPaymentType" },
              },
            },
          ],
        },
      })
    );

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const found = yield* carts.findById({
        id: CartId.make("cart-1"),
        store,
      });

      expect(Option.isNone(found)).toBeTruthy();
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect("ignores a Cart whose expanded Payment is not linked", () => {
    const clients = makeScriptedClients();
    clients.on(
      "CartById",
      cartByIdData({
        ...rawActiveCart,
        billingAddress: rawPaymentBillingAddress,
        paymentInfo: {
          paymentRefs: [{ id: "another-payment" }],
          payments: [rawPreparedCardPayment],
        },
      })
    );

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const found = yield* carts.findById({
        id: CartId.make("cart-1"),
        store,
      });

      expect(Option.isNone(found)).toBeTruthy();
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect(
    "ignores a Cart with linked Payments but no prepared Payment",
    () => {
      const clients = makeScriptedClients();
      clients.on(
        "CartById",
        cartByIdData({
          ...rawActiveCart,
          paymentInfo: { paymentRefs: [{ id: "orphaned-payment" }] },
        })
      );

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const found = yield* carts.findById({
          id: CartId.make("cart-1"),
          store,
        });

        expect(Option.isNone(found)).toBeTruthy();
      }).pipe(Effect.provide(clients.layer));
    }
  );

  it.effect("defects when persisted Checkout custom JSON is malformed", () => {
    const clients = makeScriptedClients();
    clients.on(
      "CartById",
      cartByIdData({
        ...rawActiveCart,
        custom: {
          customFieldsRaw: [
            { name: "checkoutDeliveryDetails", value: "{not-json" },
          ],
          type: { key: "order" },
        },
      })
    );

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const exit = yield* carts
        .findById({ id: CartId.make("cart-1"), store })
        .pipe(Effect.exit);

      if (!Exit.isFailure(exit)) {
        throw new Error("Expected malformed persisted Checkout JSON to defect");
      }
      expect(exit.cause.reasons.some(Cause.isDieReason)).toBeTruthy();
      expect(Cause.pretty(exit.cause)).toContain(
        "Expected a valid JSON string"
      );
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect("ignores native Shipping that no longer matches the Cart", () => {
    const clients = makeScriptedClients();
    const groupReference = DeliveryGroupReference.make("delivery-1");
    const quoteReference = DeliveryPlanQuoteReference.make("quote-1");
    const planReference = DeliveryPlanReference.make("plan-1");
    const shippingKey = shippingKeyFor(
      groupReference,
      quoteReference,
      planReference
    );
    const addressKey = deliveryAddressKeyFor(groupReference);
    const address = {
      additionalStreetInfo: null,
      city: "New York",
      country: "US",
      key: addressKey,
      postalCode: "10001",
      region: null,
      state: "NY",
      streetName: "1 Hydra Way",
    };
    clients.on(
      "CartById",
      cartByIdData({
        ...rawCartWithLineItem,
        itemShippingAddresses: [address],
        lineItems: [
          {
            ...rawCartLineItem,
            shippingDetails: {
              targets: [
                {
                  addressKey,
                  quantity: 1,
                  shippingMethodKey: shippingKey,
                },
              ],
              valid: true,
            },
          },
        ],
        shipping: [
          {
            shippingAddress: address,
            shippingInfo: {
              price: { centAmount: 500, currencyCode: "USD" },
              shippingMethodName: "Standard",
              shippingMethodRef: { id: "standard" },
              shippingMethodState: "DoesNotMatchCart",
            },
            shippingKey,
          },
        ],
        shippingMode: "Multiple",
      })
    );

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const found = yield* carts.findById({
        id: CartId.make("cart-1"),
        store,
      });

      expect(Option.getOrThrow(found).checkoutDetails).not.toHaveProperty(
        "selectedDeliveryPlan"
      );
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect(
    "rejects Business Unit Carts presented as anonymous possession",
    () => {
      const clients = makeScriptedClients();
      clients.on("CartById", cartByIdData(rawBusinessUnitCart));

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const error = yield* carts
          .findById({ id: CartId.make("cart-1"), store })
          .pipe(Effect.flip);

        expect(error._tag).toBe("CartAccessDenied");
      }).pipe(Effect.provide(clients.layer));
    }
  );
});

describe("saveShippingOptions", () => {
  it.effect("maps merchandise repricing to an unavailable selection", () => {
    // SAFETY: This test exercises the anonymous Cart update chain consumed by
    // saveShippingOptions and returns the SDK response shape it awaits.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = {
      carts: () => ({
        withId: () => ({
          post: () => ({
            execute: async () =>
              await Promise.reject(
                Object.assign(new Error("No matching merchandise price"), {
                  body: { errors: [{ code: "MatchingPriceNotFound" }] },
                  statusCode: 400,
                })
              ),
          }),
        }),
      }),
    } as unknown as ByProjectKeyRequestBuilder;
    const clients = makeScriptedClients(apiRoot);
    clients.on(
      "CartById",
      cartByIdData({
        ...rawCartWithLineItem,
        itemShippingAddresses: [],
        shipping: [],
        shippingMode: "Multiple",
      })
    );

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .saveShippingOptions({
          selectedDeliveryPlan,
          target: anonymousTarget,
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartShippingSelectionUnavailable");
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect(
    "requires refresh when the confirmed write cannot be reloaded",
    () => {
      // SAFETY: This test exercises only the anonymous Cart update chain consumed
      // by saveShippingOptions and returns the SDK response shape it awaits.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
      const apiRoot = {
        carts: () => ({
          withId: () => ({
            post: () => ({
              execute: async () =>
                await Promise.resolve({ body: { id: "cart-1" } }),
            }),
          }),
        }),
      } as unknown as ByProjectKeyRequestBuilder;
      const clients = makeScriptedClients(apiRoot);
      clients.on(
        "CartById",
        cartByIdData({
          ...rawCartWithLineItem,
          itemShippingAddresses: [],
          shipping: [],
          shippingMode: "Multiple",
        }),
        {
          error: {
            message: "Reload unavailable",
            networkError: new Error("Reload unavailable"),
          },
        }
      );

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const error = yield* carts
          .saveShippingOptions({
            selectedDeliveryPlan,
            target: anonymousTarget,
          })
          .pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: "CartShippingOptionsRefreshRequired",
          cartId: "cart-1",
          operation: "saveShippingOptions",
        });
      }).pipe(Effect.provide(clients.layer));
    }
  );
});

describe("addItem", () => {
  it.effect(
    "resolves the Store distribution channel before writing the line item",
    () => {
      const clients = makeScriptedClients();
      clients.on("CartById", cartByIdData(rawActiveCart));
      clients.on("ProviderCartDistributionChannel", distributionChannelData);
      clients.on(
        "AddItemToCart",
        updateCartData({ ...rawCartWithLineItem, version: providerVersion })
      );

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const updated = yield* carts.addItem({
          productId: ProductId.make("product-1"),
          quantity: 1,
          target: anonymousTarget,
          variantId: VariantId.make("3"),
        });

        expect(updated).toMatchObject({ id: "cart-1" });
        expect(clients.callsFor("AddItemToCart")[0]?.variables).toMatchObject({
          distributionChannelKey: "distribution-channel-1",
        });
      }).pipe(Effect.provide(clients.layer));
    }
  );

  it.effect("maps provider-confirmed unavailable merchandise", () => {
    const clients = makeScriptedClients();
    clients.on("CartById", cartByIdData(rawActiveCart));
    clients.on("ProviderCartDistributionChannel", distributionChannelData);
    clients.on("AddItemToCart", {
      error: {
        graphQLErrors: [{ extensions: { code: "MatchingPriceNotFound" } }],
        message: "No matching price",
      },
    });

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .addItem({
          productId: ProductId.make("product-1"),
          quantity: 1,
          target: anonymousTarget,
          variantId: VariantId.make("3"),
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartMerchandiseUnavailable");
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect("preserves an ambiguous add-line-item result as unknown", () => {
    const clients = makeScriptedClients();
    clients.on("CartById", cartByIdData(rawActiveCart));
    clients.on("ProviderCartDistributionChannel", distributionChannelData);
    clients.on("AddItemToCart", {
      error: {
        message: "Connection closed after dispatch",
        networkError: new Error("Connection closed after dispatch"),
      },
    });

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .addItem({
          productId: ProductId.make("product-1"),
          quantity: 1,
          target: anonymousTarget,
          variantId: VariantId.make("3"),
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartWriteOutcomeUnknown");
    }).pipe(Effect.provide(clients.layer));
  });
});

describe("findActiveForBusinessUnit", () => {
  it.effect("projects provider Carts into domain Carts", () => {
    const clients = makeScriptedClients();
    clients.on("GetActiveCartForBusinessUnitAsAssociate", {
      data: { asAssociate: { carts: { results: [rawBusinessUnitCart] } } },
    });

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const result =
        yield* carts.findActiveForBusinessUnit(associateScopeInput);

      expect(result[0]).toMatchObject({
        buyingContext: { businessUnitId: "business-unit-1" },
        id: "cart-1",
      });
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect(
    "preserves provider authorization failures as access denied",
    () => {
      const clients = makeScriptedClients();
      clients.on("GetActiveCartForBusinessUnitAsAssociate", forbidden);

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const error = yield* carts
          .findActiveForBusinessUnit(associateScopeInput)
          .pipe(Effect.flip);

        expect(error._tag).toBe("CartAccessDenied");
      }).pipe(Effect.provide(clients.layer));
    }
  );

  it.effect("treats an unclassified provider read failure as a defect", () => {
    const clients = makeScriptedClients();
    clients.on("GetActiveCartForBusinessUnitAsAssociate", {
      error: {
        graphQLErrors: [
          { extensions: { code: "InternalProviderContractViolation" } },
        ],
        message: "Unexpected provider response",
      },
    });

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const exit = yield* carts
        .findActiveForBusinessUnit(associateScopeInput)
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
      expect(Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "").toContain(
        "Unexpected provider response"
      );
    }).pipe(Effect.provide(clients.layer));
  });
});

describe("setLineItemQuantity", () => {
  it.effect("rejects a missing line before changing its quantity", () => {
    const clients = makeScriptedClients();
    clients.on("CartById", cartByIdData(rawActiveCart));

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .setLineItemQuantity({
          lineItemId: LineItemId.make("line-1"),
          quantity: 2,
          target: anonymousTarget,
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartLineItemNotFound");
    }).pipe(Effect.provide(clients.layer));
  });

  it.effect("preserves an unknown quantity-write outcome", () => {
    const clients = makeScriptedClients();
    clients.on("CartById", cartByIdData(rawCartWithLineItem));
    clients.on("ChangeItemQuantity", {
      error: {
        message: "Connection closed after dispatch",
        networkError: new Error("Connection closed after dispatch"),
      },
    });

    return Effect.gen(function* () {
      const carts = yield* Carts;
      const error = yield* carts
        .setLineItemQuantity({
          lineItemId: LineItemId.make("line-1"),
          quantity: 2,
          target: anonymousTarget,
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("CartWriteOutcomeUnknown");
    }).pipe(Effect.provide(clients.layer));
  });
});

describe("versioned write conflict policy", () => {
  it.effect(
    "retries a narrow Delivery action with the provider version",
    () => {
      const clients = makeScriptedClients();
      clients.on("CartById", cartByIdData(rawActiveCart));
      clients.on(
        "SaveCheckoutDeliveryDetails",
        concurrentModification(providerVersion),
        updateCartData(rawActiveCart)
      );

      return Effect.gen(function* () {
        const carts = yield* Carts;
        yield* carts.saveDeliveryDetails({
          deliveryDetails: {
            shippingAddress: {
              addressLine1: "123 Analytical Engine Way",
              city: "London",
              country: CountryCode.make("GB"),
              postalCode: "SW1A 1AA",
            },
            source: "manual",
          },
          target: anonymousTarget,
        });

        const writes = clients.callsFor("SaveCheckoutDeliveryDetails");
        expect(writes).toHaveLength(2);
        expect(writes[1]?.variables).toMatchObject({
          version: providerVersion,
        });
      }).pipe(Effect.provide(clients.layer));
    }
  );

  it.effect(
    "does not retry a setCustomType Contact write and surfaces the conflict",
    () => {
      const clients = makeScriptedClients();
      clients.on("CartById", cartByIdData(rawActiveCart));
      clients.on(
        "SaveCheckoutContact",
        concurrentModification(providerVersion),
        concurrentModification(providerVersion)
      );

      return Effect.gen(function* () {
        const carts = yield* Carts;
        const error = yield* carts
          .saveContact({
            contact: {
              buyerContact: {
                email: "ada@example.com",
                firstName: "Ada",
                lastName: "Lovelace",
              },
              source: "manual",
            },
            target: anonymousTarget,
          })
          .pipe(Effect.flip);

        expect(error._tag).toBe("CartWriteConflict");
      }).pipe(Effect.provide(clients.layer));
    }
  );
});
