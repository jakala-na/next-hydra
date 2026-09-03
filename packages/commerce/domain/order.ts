import { PaymentMethodSummary } from "@repo/payments";
import type { PaymentReference } from "@repo/payments";
import { Schema } from "effect";

import { CartId, CartMoney } from "./cart";
import { ProviderFailureReason } from "./provider-failure";

export const OrderId = Schema.NonEmptyString.pipe(Schema.brand("OrderId"));
export type OrderId = typeof OrderId.Type;

export const OrderNumber = Schema.NonEmptyString.pipe(
  Schema.brand("OrderNumber")
);
export type OrderNumber = typeof OrderNumber.Type;

export const OrderSnapshot = Schema.Struct({
  cartId: CartId,
  id: OrderId,
  number: OrderNumber,
  paymentMethod: PaymentMethodSummary,
  totalPrice: CartMoney,
});
export type OrderSnapshot = typeof OrderSnapshot.Type;

export interface OrderRecord {
  readonly cartId: CartId;
  readonly id: OrderId;
  readonly number: OrderNumber;
  readonly paymentReference: PaymentReference;
  readonly totalPrice: CartMoney;
}

export const toOrderSnapshot = (
  order: OrderRecord,
  paymentMethod: PaymentMethodSummary
): OrderSnapshot => ({
  cartId: order.cartId,
  id: order.id,
  number: order.number,
  paymentMethod,
  totalPrice: order.totalPrice,
});

export const OrderPlacementResult = Schema.Union([
  Schema.TaggedStruct("PaymentActionRequired", {
    paymentAction: Schema.Struct({
      clientToken: Schema.String,
      method: Schema.Literal("card"),
      provider: Schema.String,
      publicConfiguration: Schema.String,
    }),
  }),
  Schema.TaggedStruct("PlacementPending", {}),
  Schema.TaggedStruct("Placed", {
    order: OrderSnapshot,
    paymentStatus: Schema.Literals(["confirmed", "pending"]),
  }),
]);
export type OrderPlacementResult = typeof OrderPlacementResult.Type;

export const OrderRejectionReason = Schema.Literals([
  "cartChanged",
  "invalidCart",
  "outOfStock",
  "priceChanged",
  "shippingInvalid",
]);
export type OrderRejectionReason = typeof OrderRejectionReason.Type;

export class OrderPlacementRejected extends Schema.TaggedError<OrderPlacementRejected>()(
  "OrderPlacementRejected",
  {
    message: Schema.String,
    reason: OrderRejectionReason,
  }
) {}

export class OrderPlacementOutcomeUnknown extends Schema.TaggedError<OrderPlacementOutcomeUnknown>()(
  "OrderPlacementOutcomeUnknown",
  {
    cartId: CartId,
    message: Schema.String,
    number: OrderNumber,
  }
) {}

export class OrderProviderFailure extends Schema.TaggedError<OrderProviderFailure>()(
  "OrderProviderFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    operation: Schema.String,
    reason: ProviderFailureReason,
  }
) {}

export const orderNumberForCart = (cartId: CartId) =>
  OrderNumber.make(`checkout-${cartId}`);
