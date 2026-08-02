import { Schema } from "effect";
import { CartId, LineItemId, ProductId, VariantId } from "./cart";
import { CommerceBusinessUnitId } from "./commerce-account";

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
]);
export type CartOperation = typeof CartOperation.Type;

export class CartNotFound extends Schema.TaggedErrorClass<CartNotFound>()(
  "CartNotFound",
  {
    cartId: CartId,
    operation: CartOperation,
  }
) {}

export class CartLineItemNotFound extends Schema.TaggedErrorClass<CartLineItemNotFound>()(
  "CartLineItemNotFound",
  {
    cartId: CartId,
    lineItemId: LineItemId,
    operation: CartOperation,
  }
) {}

export class CartMerchandiseUnavailable extends Schema.TaggedErrorClass<CartMerchandiseUnavailable>()(
  "CartMerchandiseUnavailable",
  {
    productId: ProductId,
    variantId: VariantId,
  }
) {}

export class CartAccessDenied extends Schema.TaggedErrorClass<CartAccessDenied>()(
  "CartAccessDenied",
  {
    cartId: Schema.optional(CartId),
    operation: CartOperation,
  }
) {}

export class CartWriteConflict extends Schema.TaggedErrorClass<CartWriteConflict>()(
  "CartWriteConflict",
  {
    cartId: CartId,
    operation: CartOperation,
  }
) {}

export class CartWriteOutcomeUnknown extends Schema.TaggedErrorClass<CartWriteOutcomeUnknown>()(
  "CartWriteOutcomeUnknown",
  {
    operation: CartOperation,
    cartId: Schema.optional(CartId),
  }
) {}

export class CartProviderFailure extends Schema.TaggedErrorClass<CartProviderFailure>()(
  "CartProviderFailure",
  {
    operation: CartOperation,
    reason: Schema.Literals([
      "unavailable",
      "invalidData",
      "unexpectedResponse",
    ]),
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class CurrentCartSelectionConflict extends Schema.TaggedErrorClass<CurrentCartSelectionConflict>()(
  "CurrentCartSelectionConflict",
  {
    businessUnitId: CommerceBusinessUnitId,
    cartIds: Schema.Array(CartId),
  }
) {}

export class CurrentCartOperationFailure extends Schema.TaggedErrorClass<CurrentCartOperationFailure>()(
  "CurrentCartOperationFailure",
  {
    operation: Schema.Literal("set"),
    cause: Schema.optional(Schema.Defect),
  }
) {}

export const currentCartOperationFailure = (cause: unknown) =>
  new CurrentCartOperationFailure({ operation: "set", cause });

export class CurrentCartUnavailable extends Schema.TaggedErrorClass<CurrentCartUnavailable>()(
  "CurrentCartUnavailable",
  {
    reason: Schema.Literals(["noCart", "inaccessibleCart"]),
  }
) {}

export class CartPolicyFailure extends Schema.TaggedErrorClass<CartPolicyFailure>()(
  "CartPolicyFailure",
  {
    cause: Schema.optional(Schema.Defect),
  }
) {}
