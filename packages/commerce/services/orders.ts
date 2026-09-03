import type { PaymentReference } from "@repo/payments";
import { Context, Effect, Layer, Option, Ref } from "effect";

import type { CartId, CartMoney } from "../domain/cart";
import type { CheckoutScope } from "../domain/checkout";
import type {
  OrderId,
  OrderPlacementOutcomeUnknown,
  OrderPlacementRejected,
  OrderProviderFailure,
  OrderRecord,
} from "../domain/order";
import { OrderId as OrderIdSchema, orderNumberForCart } from "../domain/order";

export interface FindOrderInput {
  readonly cartId: CartId;
  readonly scope: CheckoutScope;
}

export interface FindOrderByIdInput {
  readonly anonymousAccess?: {
    readonly cartId: CartId;
    readonly orderId: OrderId;
  };
  readonly id: OrderId;
  readonly scope: CheckoutScope;
}

export interface PlaceOrderInput extends FindOrderInput {
  readonly paymentReference: PaymentReference;
  readonly totalPrice: CartMoney;
}

export interface OrdersMemorySeed {
  readonly placeFailure?:
    | OrderPlacementOutcomeUnknown
    | OrderPlacementRejected
    | OrderProviderFailure;
}

export class Orders extends Context.Service<
  Orders,
  {
    readonly find: (
      input: FindOrderInput
    ) => Effect.Effect<Option.Option<OrderRecord>, OrderProviderFailure>;
    readonly findById: (
      input: FindOrderByIdInput
    ) => Effect.Effect<Option.Option<OrderRecord>, OrderProviderFailure>;
    readonly place: (
      input: PlaceOrderInput
    ) => Effect.Effect<
      OrderRecord,
      | OrderPlacementOutcomeUnknown
      | OrderPlacementRejected
      | OrderProviderFailure
    >;
  }
>()("@repo/commerce/Orders") {
  static readonly layerMemory = (seed: OrdersMemorySeed = {}) =>
    Layer.effect(
      Orders,
      Effect.gen(function* () {
        const orders = yield* Ref.make(new Map<CartId, OrderRecord>());
        return Orders.of({
          find: Effect.fn("Orders.memory.find")((input) =>
            Ref.get(orders).pipe(
              Effect.map((current) =>
                Option.fromNullishOr(current.get(input.cartId))
              )
            )
          ),
          findById: Effect.fn("Orders.memory.findById")((input) =>
            Ref.get(orders).pipe(
              Effect.map((current) =>
                Option.fromNullishOr(
                  [...current.values()].find((order) => order.id === input.id)
                )
              )
            )
          ),
          place: Effect.fn("Orders.memory.place")((input) =>
            Effect.gen(function* () {
              const existing = (yield* Ref.get(orders)).get(input.cartId);
              if (existing !== undefined) {
                return existing;
              }
              if (seed.placeFailure !== undefined) {
                return yield* seed.placeFailure;
              }
              const order: OrderRecord = {
                cartId: input.cartId,
                id: OrderIdSchema.make(`order-${input.cartId}`),
                number: orderNumberForCart(input.cartId),
                paymentReference: input.paymentReference,
                totalPrice: input.totalPrice,
              };
              yield* Ref.update(orders, (current) =>
                new Map(current).set(input.cartId, order)
              );
              return order;
            })
          ),
        });
      })
    );
}
