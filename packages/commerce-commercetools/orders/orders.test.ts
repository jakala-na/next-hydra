/* oxlint-disable typescript/promise-function-async -- Provider contract doubles return settled Promises. */
import type {
  ByProjectKeyRequestBuilder,
  OrderFromCartDraft,
} from "@commercetools/platform-sdk";
import { CartId } from "@repo/commerce/domain/cart";
import {
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "@repo/commerce/domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import { OrderId } from "@repo/commerce/domain/order";
import { Orders } from "@repo/commerce/services/orders";
import { CommerceLocale } from "@repo/commerce/store";
import { PaymentReference } from "@repo/payments";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";

import { ordersLayerFrom } from "./orders";

const cartId = CartId.make("cart-from-input");
const totalPrice = { centAmount: 1_700_000, currencyCode: "USD" } as const;
const paymentReference = PaymentReference.make("payment-from-input");
const anonymousScope = new StorefrontAnonymousCheckoutScope({
  anonymousCartId: cartId,
  channel: "storefrontAnonymous",
  locale: CommerceLocale.make("en-US"),
});
const consumedAnonymousCartScope = new StorefrontAnonymousCheckoutScope({
  channel: "storefrontAnonymous",
  locale: CommerceLocale.make("en-US"),
});
const customerScope = new StorefrontCustomerCheckoutScope({
  businessUnitId: CommerceBusinessUnitId.make("business-unit-from-input"),
  businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-from-input"),
  channel: "storefrontCustomer",
  customerId: CommerceCustomerId.make("customer-from-input"),
  locale: CommerceLocale.make("en-US"),
});
const cart = {
  cartState: "Active",
  customerId: undefined,
  id: cartId,
  paymentInfo: { payments: [{ id: paymentReference, typeId: "payment" }] },
  totalPrice,
  version: 7,
};
const order = {
  cart: { id: cartId, typeId: "cart" },
  id: "order-from-provider",
  orderNumber: `checkout-${cartId}`,
  paymentInfo: { payments: [{ id: paymentReference, typeId: "payment" }] },
  totalPrice,
};
const notFound = () =>
  Promise.reject(
    Object.assign(new Error("Order not found"), { statusCode: 404 })
  );

const apiRootFrom = ({
  createOrder = () => Promise.resolve({ body: order }),
  findOrderById = notFound,
  findOrder = notFound,
}: {
  readonly createOrder?: () => Promise<object>;
  readonly findOrderById?: () => Promise<object>;
  readonly findOrder?: () => Promise<object>;
} = {}) => {
  let submittedOrder: OrderFromCartDraft | undefined;
  const apiRoot = {
    carts: () => ({
      withId: () => ({
        get: () => ({ execute: () => Promise.resolve({ body: cart }) }),
      }),
    }),
    orders: () => ({
      post: ({ body }: { readonly body: OrderFromCartDraft }) => ({
        execute: () => {
          submittedOrder = body;
          return createOrder();
        },
      }),
      withId: () => ({ get: () => ({ execute: findOrderById }) }),
      withOrderNumber: () => ({ get: () => ({ execute: findOrder }) }),
    }),
  };
  return {
    // SAFETY: The adapter consumes only the Cart and Order request-builder
    // methods implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    apiRoot: apiRoot as unknown as ByProjectKeyRequestBuilder,
    submittedOrder: () => submittedOrder,
  };
};

describe("Commercetools Orders", () => {
  it("creates an Order from the asserted Cart version and deterministic number", async () => {
    const { apiRoot, submittedOrder } = apiRootFrom();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const orders = yield* Orders;
        return yield* orders.place({
          cartId,
          paymentReference,
          scope: anonymousScope,
          totalPrice,
        });
      }).pipe(Effect.provide(ordersLayerFrom(apiRoot)))
    );

    expect(result).toStrictEqual({
      cartId,
      id: "order-from-provider",
      number: `checkout-${cartId}`,
      paymentReference,
      totalPrice,
    });
    expect(submittedOrder()).toStrictEqual({
      cart: { id: cartId, typeId: "cart" },
      orderNumber: `checkout-${cartId}`,
      version: 7,
    });
  });

  it("recovers the created Order after losing the create response", async () => {
    const { apiRoot } = apiRootFrom({
      createOrder: () => Promise.reject(new Error("response lost")),
      findOrder: () => Promise.resolve({ body: order }),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const orders = yield* Orders;
        return yield* orders.place({
          cartId,
          paymentReference,
          scope: anonymousScope,
          totalPrice,
        });
      }).pipe(Effect.provide(ordersLayerFrom(apiRoot)))
    );

    expect(result.id).toBe("order-from-provider");
  });

  it("maps a definitive inventory rejection after recovery finds no Order", async () => {
    const { apiRoot } = apiRootFrom({
      createOrder: () =>
        Promise.reject(
          Object.assign(new Error("Cart inventory changed"), {
            body: { errors: [{ code: "OutOfStock" }] },
            statusCode: 400,
          })
        ),
    });

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const orders = yield* Orders;
        return yield* orders
          .place({
            cartId,
            paymentReference,
            scope: anonymousScope,
            totalPrice,
          })
          .pipe(Effect.flip);
      }).pipe(Effect.provide(ordersLayerFrom(apiRoot)))
    );

    expect(failure).toMatchObject({
      _tag: "OrderPlacementRejected",
      reason: "outOfStock",
    });
  });

  it("maps a concurrent Cart change to a definitive placement rejection", async () => {
    const { apiRoot } = apiRootFrom({
      createOrder: () =>
        Promise.reject(
          Object.assign(new Error("Cart version changed"), {
            body: { errors: [{ code: "ConcurrentModification" }] },
            statusCode: 409,
          })
        ),
    });

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const orders = yield* Orders;
        return yield* orders
          .place({
            cartId,
            paymentReference,
            scope: anonymousScope,
            totalPrice,
          })
          .pipe(Effect.flip);
      }).pipe(Effect.provide(ordersLayerFrom(apiRoot)))
    );

    expect(failure).toMatchObject({
      _tag: "OrderPlacementRejected",
      reason: "cartChanged",
    });
  });

  it("pretends an Order outside the current customer authority does not exist", async () => {
    const { apiRoot } = apiRootFrom({
      findOrder: () =>
        Promise.resolve({
          body: {
            ...order,
            businessUnit: {
              key: "another-business-unit",
              typeId: "business-unit",
            },
            customerId: "another-customer",
          },
        }),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const orders = yield* Orders;
        return yield* orders.find({ cartId, scope: customerScope });
      }).pipe(Effect.provide(ordersLayerFrom(apiRoot)))
    );

    expect(Option.isNone(result)).toBeTruthy();
  });

  it("reads an Order by ID only for the current Checkout authority", async () => {
    const { apiRoot } = apiRootFrom({
      findOrderById: () => Promise.resolve({ body: order }),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const orders = yield* Orders;
        return yield* orders.findById({
          anonymousAccess: {
            cartId,
            orderId: OrderId.make("order-from-provider"),
          },
          id: OrderId.make("order-from-provider"),
          scope: consumedAnonymousCartScope,
        });
      }).pipe(Effect.provide(ordersLayerFrom(apiRoot)))
    );

    expect(Option.getOrThrow(result)).toStrictEqual({
      cartId,
      id: "order-from-provider",
      number: `checkout-${cartId}`,
      paymentReference,
      totalPrice,
    });
  });

  it("keeps unclassified CommerceTools client failures as provider defects", async () => {
    const { apiRoot } = apiRootFrom({
      createOrder: () =>
        Promise.reject(
          Object.assign(new Error("CommerceTools credentials were rejected"), {
            statusCode: 401,
          })
        ),
    });

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const orders = yield* Orders;
        return yield* orders
          .place({
            cartId,
            paymentReference,
            scope: anonymousScope,
            totalPrice,
          })
          .pipe(Effect.flip);
      }).pipe(Effect.provide(ordersLayerFrom(apiRoot)))
    );

    expect(failure).toMatchObject({
      _tag: "OrderProviderFailure",
      reason: "unexpectedResponse",
    });
  });

  it("pretends an anonymous Order without matching Order access does not exist", async () => {
    const { apiRoot } = apiRootFrom({
      findOrderById: () => Promise.resolve({ body: order }),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const orders = yield* Orders;
        return yield* orders.findById({
          id: OrderId.make("order-from-provider"),
          scope: anonymousScope,
        });
      }).pipe(Effect.provide(ordersLayerFrom(apiRoot)))
    );

    expect(Option.isNone(result)).toBeTruthy();
  });
});
