import "server-only";
import { Effect } from "effect";

import { CartProviderFailure } from "../domain/cart-errors";
import { CurrentCartState } from "../domain/cart-snapshot";
import type { CommerceRequestContextNotFound } from "../domain/commerce-request-context";
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
  RemoveCartLineItemActionFailure,
  SetCartLineItemQuantityActionFailure,
} from "./action-result";
import { AddToCartInputSchema } from "./add-to-cart";
import { ChangeCartItemsQuantityInputSchema } from "./change-cart-items-quantity";
import { RemoveCartItemInputSchema } from "./remove-cart-item";

type CartMutationFailure =
  | AddCurrentCartItemFailure
  | RemoveCurrentCartLineItemFailure
  | SetCurrentCartLineItemQuantityFailure;

const cartMutationFailure = <Failure extends CartMutationFailure>(
  operation: CartActionOperation,
  error: Failure | NextCommerceRequestError
): Failure | CommerceRequestContextNotFound | CartProviderFailure => {
  if (error._tag === "CommerceAccountError") {
    return new CartProviderFailure({
      cause: error,
      operation,
      reason: "unavailable",
    });
  }
  if (error._tag === "CommerceRequestFailure") {
    return new CartProviderFailure({
      cause: error,
      operation,
      reason: "invalidData",
    });
  }

  return error;
};

const logCartMutationFailure =
  (operation: CartActionOperation) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    program.pipe(
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect combinator, not Promise control flow.
      Effect.tapError((error) =>
        Effect.logError("Current Cart mutation failed", error).pipe(
          Effect.annotateLogs({ operation: `currentCart.${operation}` })
        )
      )
    );

const addToCartProgram = Effect.fn("CartAction.addToCart")(
  (input: typeof AddToCartInputSchema.Type) =>
    CurrentCart.addItem(input).pipe(logCartMutationFailure("addItem"))
);

const changeCartItemsQuantityProgram = Effect.fn(
  "CartAction.changeCartItemsQuantity"
)((input: typeof ChangeCartItemsQuantityInputSchema.Type) =>
  CurrentCart.setLineItemQuantity(input).pipe(
    logCartMutationFailure("setLineItemQuantity")
  )
);

const removeCartItemProgram = Effect.fn("CartAction.removeCartItem")(
  (input: typeof RemoveCartItemInputSchema.Type) =>
    CurrentCart.removeLineItem(input).pipe(
      logCartMutationFailure("removeLineItem")
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
    .mapError((error: AddCurrentCartItemFailure | NextCommerceRequestError) =>
      cartMutationFailure("addItem", error)
    )
    .handle(addToCartProgram),
  changeCartItemsQuantityProcedure: actions
    .procedure("CartAction.changeCartItemsQuantity")
    .input(ChangeCartItemsQuantityInputSchema)
    .output(CurrentCartState)
    .error(SetCartLineItemQuantityActionFailure)
    .mapError(
      (
        error: SetCurrentCartLineItemQuantityFailure | NextCommerceRequestError
      ) => cartMutationFailure("setLineItemQuantity", error)
    )
    .handle(changeCartItemsQuantityProgram),
  removeCartItemProcedure: actions
    .procedure("CartAction.removeCartItem")
    .input(RemoveCartItemInputSchema)
    .output(CurrentCartState)
    .error(RemoveCartLineItemActionFailure)
    .mapError(
      (error: RemoveCurrentCartLineItemFailure | NextCommerceRequestError) =>
        cartMutationFailure("removeLineItem", error)
    )
    .handle(removeCartItemProgram),
});
