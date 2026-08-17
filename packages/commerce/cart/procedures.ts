import "server-only";
/* oxlint-disable promise/prefer-await-to-callbacks -- Action procedure callbacks compose Effects, not Promises. */
import { Effect } from "effect";

import type {
  CartPolicyFailure,
  CartProviderFailure,
} from "../domain/cart-errors";
import { CurrentCartState } from "../domain/cart-snapshot";
import type {
  CommerceActionClient,
  NextCommerceRequestError,
} from "../runtime";
import type {
  AddCurrentCartItemFailure,
  RemoveCurrentCartLineItemFailure,
  SetCurrentCartLineItemQuantityFailure,
} from "../services/current-cart";
import { CurrentCart } from "../services/current-cart";
import type { CartActionOperation } from "./action-result";
import {
  AddToCartActionFailure,
  makeCartContextUnavailable,
  RemoveCartLineItemActionFailure,
  SetCartLineItemQuantityActionFailure,
} from "./action-result";
import { AddToCartInputSchema } from "./add-to-cart";
import { ChangeCartItemsQuantityInputSchema } from "./change-cart-items-quantity";
import { retainExpectedCartMutationFailures } from "./failure-policy";
import { RemoveCartItemInputSchema } from "./remove-cart-item";

type AddToCartExpectedFailure = Exclude<
  AddCurrentCartItemFailure,
  | CartPolicyFailure
  | CartProviderFailure
  | { readonly _tag: "CurrentCartOperationFailure" }
>;
type SetCartLineItemQuantityExpectedFailure = Exclude<
  SetCurrentCartLineItemQuantityFailure,
  CartPolicyFailure | CartProviderFailure
>;
type RemoveCartLineItemExpectedFailure = Exclude<
  RemoveCurrentCartLineItemFailure,
  CartPolicyFailure | CartProviderFailure
>;
type ExpectedCartMutationFailure =
  | AddToCartExpectedFailure
  | SetCartLineItemQuantityExpectedFailure;

function cartMutationFailure(
  operation: "addItem",
  error:
    | AddToCartExpectedFailure
    | CartProviderFailure
    | NextCommerceRequestError
): AddToCartActionFailure;
function cartMutationFailure(
  operation: "setLineItemQuantity",
  error:
    | SetCartLineItemQuantityExpectedFailure
    | CartProviderFailure
    | NextCommerceRequestError
): SetCartLineItemQuantityActionFailure;
function cartMutationFailure(
  operation: "removeLineItem",
  error:
    | RemoveCartLineItemExpectedFailure
    | CartProviderFailure
    | NextCommerceRequestError
): RemoveCartLineItemActionFailure;
function cartMutationFailure(
  operation: CartActionOperation,
  error:
    | ExpectedCartMutationFailure
    | CartProviderFailure
    | NextCommerceRequestError
): AddToCartActionFailure | SetCartLineItemQuantityActionFailure {
  if (error._tag === "CommerceAccountUnavailable") {
    return {
      _tag: "CartProviderFailure",
      operation,
      reason: "unavailable",
    };
  }
  if (error._tag === "CommerceRequestContextNotFound") {
    return makeCartContextUnavailable({
      message: "The cart is unavailable for the current account.",
      reason: error.reason,
    });
  }
  if (error._tag === "CartProviderFailure") {
    if (error.reason !== "unavailable") {
      throw error;
    }

    return {
      _tag: "CartProviderFailure",
      operation: error.operation,
      reason: "unavailable",
    };
  }
  return error;
}

const addToCartProgram = Effect.fn("CartAction.addToCart")(
  (input: typeof AddToCartInputSchema.Type) =>
    CurrentCart.addItem(input).pipe(
      retainExpectedCartMutationFailures("addItem")
    )
);

const changeCartItemsQuantityProgram = Effect.fn(
  "CartAction.changeCartItemsQuantity"
)((input: typeof ChangeCartItemsQuantityInputSchema.Type) =>
  CurrentCart.setLineItemQuantity(input).pipe(
    retainExpectedCartMutationFailures("setLineItemQuantity")
  )
);

const removeCartItemProgram = Effect.fn("CartAction.removeCartItem")(
  (input: typeof RemoveCartItemInputSchema.Type) =>
    CurrentCart.removeLineItem(input).pipe(
      retainExpectedCartMutationFailures("removeLineItem")
    )
);

export const makeCartProcedures = <RuntimeServices, Context extends object>(
  actions: CommerceActionClient<CurrentCart, RuntimeServices, Context>
) => ({
  addToCartProcedure: actions
    .procedure("CartAction.addToCart")
    .input(AddToCartInputSchema)
    .output(CurrentCartState)
    .error(AddToCartActionFailure)
    .mapError(
      (
        error:
          | AddToCartExpectedFailure
          | CartProviderFailure
          | NextCommerceRequestError
      ) => cartMutationFailure("addItem", error)
    )
    .handle(addToCartProgram),
  changeCartItemsQuantityProcedure: actions
    .procedure("CartAction.changeCartItemsQuantity")
    .input(ChangeCartItemsQuantityInputSchema)
    .output(CurrentCartState)
    .error(SetCartLineItemQuantityActionFailure)
    .mapError(
      (
        error:
          | Exclude<SetCurrentCartLineItemQuantityFailure, CartPolicyFailure>
          | NextCommerceRequestError
      ) => cartMutationFailure("setLineItemQuantity", error)
    )
    .handle(changeCartItemsQuantityProgram),
  removeCartItemProcedure: actions
    .procedure("CartAction.removeCartItem")
    .input(RemoveCartItemInputSchema)
    .output(CurrentCartState)
    .error(RemoveCartLineItemActionFailure)
    .mapError(
      (
        error:
          | Exclude<RemoveCurrentCartLineItemFailure, CartPolicyFailure>
          | NextCommerceRequestError
      ) => cartMutationFailure("removeLineItem", error)
    )
    .handle(removeCartItemProgram),
});
