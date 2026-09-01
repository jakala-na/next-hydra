import { Schema } from "effect";

import { CartId, LineItemId, ProductId, VariantId } from "./cart";
import { CommerceBusinessUnitId } from "./commerce-account";
import { ProviderFailureReason } from "./provider-failure";

export const CartOperation = Schema.Literals([
  "findById",
  "findActiveForBusinessUnit",
  "createAnonymous",
  "createForBusinessUnit",
  "addItem",
  "setLineItemQuantity",
  "removeLineItem",
  "saveContact",
  "saveDeliveryDetails",
  "saveShippingOptions",
]);
export type CartOperation = typeof CartOperation.Type;

export class CartNotFound extends Schema.TaggedError<CartNotFound>()(
  "CartNotFound",
  {
    cartId: CartId,
    operation: CartOperation,
  }
) {}

export class CartLineItemNotFound extends Schema.TaggedError<CartLineItemNotFound>()(
  "CartLineItemNotFound",
  {
    cartId: CartId,
    lineItemId: LineItemId,
    operation: CartOperation,
  }
) {}

export class CartMerchandiseUnavailable extends Schema.TaggedError<CartMerchandiseUnavailable>()(
  "CartMerchandiseUnavailable",
  {
    productId: ProductId,
    variantId: VariantId,
  }
) {}

export class CartAccessDenied extends Schema.TaggedError<CartAccessDenied>()(
  "CartAccessDenied",
  {
    cartId: Schema.optional(CartId),
    operation: CartOperation,
  }
) {}

export class CartWriteConflict extends Schema.TaggedError<CartWriteConflict>()(
  "CartWriteConflict",
  {
    cartId: CartId,
    operation: CartOperation,
  }
) {}

export class CartWriteOutcomeUnknown extends Schema.TaggedError<CartWriteOutcomeUnknown>()(
  "CartWriteOutcomeUnknown",
  {
    cartId: Schema.optional(CartId),
    operation: CartOperation,
  }
) {}

export class CartShippingSelectionUnavailable extends Schema.TaggedError<CartShippingSelectionUnavailable>()(
  "CartShippingSelectionUnavailable",
  {
    cartId: CartId,
    operation: Schema.Literal("saveShippingOptions"),
  }
) {}

export class CartShippingOptionsRefreshRequired extends Schema.TaggedError<CartShippingOptionsRefreshRequired>()(
  "CartShippingOptionsRefreshRequired",
  {
    cartId: CartId,
    operation: Schema.Literal("saveShippingOptions"),
  }
) {}

export class CartProviderFailure extends Schema.TaggedError<CartProviderFailure>()(
  "CartProviderFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    operation: CartOperation,
    reason: ProviderFailureReason,
  }
) {}

export class CurrentCartSelectionConflict extends Schema.TaggedError<CurrentCartSelectionConflict>()(
  "CurrentCartSelectionConflict",
  {
    businessUnitId: CommerceBusinessUnitId,
    cartIds: Schema.Array(CartId),
  }
) {}

export class CurrentCartOperationFailure extends Schema.TaggedError<CurrentCartOperationFailure>()(
  "CurrentCartOperationFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    operation: Schema.Literal("set"),
  }
) {}

export const currentCartOperationFailure = (cause: unknown) =>
  new CurrentCartOperationFailure({ cause, operation: "set" });

export class CurrentCartUnavailable extends Schema.TaggedError<CurrentCartUnavailable>()(
  "CurrentCartUnavailable",
  {
    reason: Schema.Literals(["noCart", "inaccessibleCart"]),
  }
) {}

export class CartPolicyFailure extends Schema.TaggedError<CartPolicyFailure>()(
  "CartPolicyFailure",
  {
    cause: Schema.optional(Schema.Defect()),
  }
) {}
