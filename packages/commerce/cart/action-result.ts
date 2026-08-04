import { Effect, Schema } from "effect";
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

export class CartActionInvalidInput extends Schema.TaggedErrorClass<CartActionInvalidInput>()(
  "CartActionInvalidInput",
  {
    operation: CartActionOperation,
  }
) {}

export type ActionResult<Success, Failure> =
  | { readonly success: Success }
  | { readonly error: Failure };

export const ActionResult = <
  Success extends Schema.Top,
  Failure extends Schema.Top,
>(
  success: Success,
  failure: Failure
) =>
  Schema.Union([Schema.Struct({ success }), Schema.Struct({ error: failure })]);

export const encodeActionResult =
  <Success, Failure, Encoded>(
    schema: Schema.Codec<ActionResult<Success, Failure>, Encoded, never, never>
  ) =>
  <ActualSuccess extends Success, ActualFailure extends Failure, Requirements>(
    effect: Effect.Effect<ActualSuccess, ActualFailure, Requirements>
  ): Effect.Effect<Encoded, never, Requirements> =>
    effect.pipe(
      Effect.match({
        onFailure: (error) => ({ error }),
        onSuccess: (success) => ({ success }),
      }),
      Effect.flatMap(Schema.encodeEffect(schema)),
      Effect.orDie
    );

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
  CartActionInvalidInput,
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

export const AddToCartActionResult = ActionResult(
  CurrentCartState,
  AddToCartActionFailure
);
export type AddToCartActionResult = typeof AddToCartActionResult.Encoded;

export const SetCartLineItemQuantityActionFailure = Schema.Union([
  CartActionInvalidInput,
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

export const SetCartLineItemQuantityActionResult = ActionResult(
  CurrentCartState,
  SetCartLineItemQuantityActionFailure
);
export type SetCartLineItemQuantityActionResult =
  typeof SetCartLineItemQuantityActionResult.Encoded;

export const RemoveCartLineItemActionFailure =
  SetCartLineItemQuantityActionFailure;
export type RemoveCartLineItemActionFailure =
  typeof RemoveCartLineItemActionFailure.Type;

export const RemoveCartLineItemActionResult = ActionResult(
  CurrentCartState,
  RemoveCartLineItemActionFailure
);
export type RemoveCartLineItemActionResult =
  typeof RemoveCartLineItemActionResult.Encoded;
