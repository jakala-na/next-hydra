import { makeActionResultSchema } from "@repo/actions";
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
import { CommerceRequestContextNotFound } from "../domain/commerce-request-context";

export const CartActionOperation = Schema.Literals([
  "addItem",
  "setLineItemQuantity",
  "removeLineItem",
]);
export type CartActionOperation = typeof CartActionOperation.Type;

const CartProviderActionFailure = Schema.TaggedStruct("CartProviderFailure", {
  operation: CartOperation,
  reason: Schema.Literals(["unavailable", "invalidData", "unexpectedResponse"]),
});

const CartPolicyActionFailure = Schema.TaggedStruct("CartPolicyFailure", {});

const CurrentCartActionOperationFailure = Schema.TaggedStruct(
  "CurrentCartOperationFailure",
  {
    operation: Schema.Literal("set"),
  }
);

export const AddToCartActionFailure = Schema.Union([
  CommerceRequestContextNotFound,
  CurrentCartSelectionConflict,
  CurrentCartUnavailable,
  CartMerchandiseUnavailable,
  CartWriteConflict,
  CartWriteOutcomeUnknown,
  CurrentCartActionOperationFailure,
  CartProviderActionFailure,
  CartPolicyActionFailure,
]);
export type AddToCartActionFailure = typeof AddToCartActionFailure.Type;

export const AddToCartActionResult = makeActionResultSchema(
  CurrentCartState,
  AddToCartActionFailure
);
export type AddToCartActionResult = typeof AddToCartActionResult.Encoded;

export const SetCartLineItemQuantityActionFailure = Schema.Union([
  CommerceRequestContextNotFound,
  CurrentCartSelectionConflict,
  CurrentCartUnavailable,
  CartLineItemNotFound,
  CartWriteConflict,
  CartWriteOutcomeUnknown,
  CartProviderActionFailure,
  CartPolicyActionFailure,
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
