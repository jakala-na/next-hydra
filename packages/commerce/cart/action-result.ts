import { makeActionResultSchema } from "@repo/actions";
import { definePublicError } from "@repo/errors";
import { Schema } from "effect";

import {
  CartLineItemNotFound,
  CartMerchandiseUnavailable,
  CartOperation,
  CartWriteConflict,
  CartWriteOutcomeUnknown,
  CurrentCartSelectionConflict,
  CurrentCartUnavailable,
} from "../domain/cart-errors";
import { CurrentCartState } from "../domain/cart-snapshot";

const CartContextUnavailableDefinition = definePublicError({
  category: "not_found",
  code: "cart.contextUnavailable",
  fields: {
    reason: Schema.Literals([
      "noPrincipal",
      "noCustomerMapping",
      "noBuyingContext",
    ]),
  },
  recovery: "refresh",
  status: 404,
  tag: "CommerceRequestContextNotFound",
});
export const CartContextUnavailable = CartContextUnavailableDefinition.schema;
export type CartContextUnavailable = typeof CartContextUnavailable.Type;
export const makeCartContextUnavailable = CartContextUnavailableDefinition.make;

export const CartActionOperation = Schema.Literals([
  "addItem",
  "setLineItemQuantity",
  "removeLineItem",
]);
export type CartActionOperation = typeof CartActionOperation.Type;

export const CartProviderActionFailure = Schema.TaggedStruct(
  "CartProviderFailure",
  {
    operation: CartOperation,
    reason: Schema.Literal("unavailable"),
  }
);
export type CartProviderActionFailure = typeof CartProviderActionFailure.Type;

export const AddToCartActionFailure = Schema.Union([
  CartContextUnavailable,
  CurrentCartSelectionConflict,
  CurrentCartUnavailable,
  CartMerchandiseUnavailable,
  CartWriteConflict,
  CartWriteOutcomeUnknown,
  CartProviderActionFailure,
]);
export type AddToCartActionFailure = typeof AddToCartActionFailure.Type;

export const AddToCartActionResult = makeActionResultSchema(
  CurrentCartState,
  AddToCartActionFailure
);
export type AddToCartActionResult = typeof AddToCartActionResult.Encoded;

export const SetCartLineItemQuantityActionFailure = Schema.Union([
  CartContextUnavailable,
  CurrentCartSelectionConflict,
  CurrentCartUnavailable,
  CartLineItemNotFound,
  CartWriteConflict,
  CartWriteOutcomeUnknown,
  CartProviderActionFailure,
]);
export type SetCartLineItemQuantityActionFailure =
  typeof SetCartLineItemQuantityActionFailure.Type;

export const SetCartLineItemQuantityActionResult = makeActionResultSchema(
  CurrentCartState,
  SetCartLineItemQuantityActionFailure
);
export type SetCartLineItemQuantityActionResult =
  typeof SetCartLineItemQuantityActionResult.Encoded;

export const RemoveCartLineItemActionFailure =
  SetCartLineItemQuantityActionFailure;
export type RemoveCartLineItemActionFailure =
  typeof RemoveCartLineItemActionFailure.Type;

export const RemoveCartLineItemActionResult = makeActionResultSchema(
  CurrentCartState,
  RemoveCartLineItemActionFailure
);
export type RemoveCartLineItemActionResult =
  typeof RemoveCartLineItemActionResult.Encoded;
