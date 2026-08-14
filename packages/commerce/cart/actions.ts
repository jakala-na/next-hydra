"use server";

import { NextCommerce } from "@repo/commerce/runtime";
import { Effect, Schema } from "effect";
import { CartProviderFailure } from "../domain/cart-errors";
import type { CommerceRequestFailure } from "../runtime/commerce-request";
import type { CommerceAccountError } from "../services/commerce-accounts";
import { CurrentCart } from "../services/current-cart";
import {
  AddToCartActionResult,
  CartActionInvalidInput,
  type CartActionOperation,
  encodeActionResult,
  RemoveCartLineItemActionResult,
  SetCartLineItemQuantityActionResult,
} from "./action-result";
import { type AddToCartInput, AddToCartInputSchema } from "./add-to-cart";
import {
  type ChangeCartItemsQuantityInput,
  ChangeCartItemsQuantityInputSchema,
} from "./change-cart-items-quantity";
import {
  type RemoveCartItemInput,
  RemoveCartItemInputSchema,
} from "./remove-cart-item";

const invalidInput = (operation: CartActionOperation) =>
  new CartActionInvalidInput({ operation });

const cartRequestFailureCases = (operation: CartActionOperation) => ({
  CommerceAccountError: (cause: CommerceAccountError) =>
    Effect.fail(
      new CartProviderFailure({
        cause,
        operation,
        reason: "unavailable",
      })
    ),
  CommerceRequestFailure: (cause: CommerceRequestFailure) =>
    Effect.fail(
      new CartProviderFailure({
        cause,
        operation,
        reason: "invalidData",
      })
    ),
});

const addToCartProgram = Effect.fn("CartAction.addToCart")(
  (input: AddToCartInput) =>
    Schema.decodeUnknownEffect(AddToCartInputSchema)(input).pipe(
      Effect.mapError(() => invalidInput("addItem")),
      Effect.flatMap(CurrentCart.addItem),
      Effect.tapError((error) =>
        Effect.logError("Current Cart mutation failed", error).pipe(
          Effect.annotateLogs({ operation: "currentCart.addItem" })
        )
      )
    )
);

export const addToCart = NextCommerce.build(addToCartProgram, {
  transform: (effect) =>
    effect.pipe(
      Effect.catchTags(cartRequestFailureCases("addItem")),
      encodeActionResult(AddToCartActionResult)
    ),
});

const changeCartItemsQuantityProgram = Effect.fn(
  "CartAction.changeCartItemsQuantity"
)((input: ChangeCartItemsQuantityInput) =>
  Schema.decodeUnknownEffect(ChangeCartItemsQuantityInputSchema)(input).pipe(
    Effect.mapError(() => invalidInput("setLineItemQuantity")),
    Effect.flatMap(CurrentCart.setLineItemQuantity),
    Effect.tapError((error) =>
      Effect.logError("Current Cart mutation failed", error).pipe(
        Effect.annotateLogs({
          operation: "currentCart.setLineItemQuantity",
        })
      )
    )
  )
);

export const changeCartItemsQuantity = NextCommerce.build(
  changeCartItemsQuantityProgram,
  {
    transform: (effect) =>
      effect.pipe(
        Effect.catchTags(cartRequestFailureCases("setLineItemQuantity")),
        encodeActionResult(SetCartLineItemQuantityActionResult)
      ),
  }
);

const removeCartItemProgram = Effect.fn("CartAction.removeCartItem")(
  (input: RemoveCartItemInput) =>
    Schema.decodeUnknownEffect(RemoveCartItemInputSchema)(input).pipe(
      Effect.mapError(() => invalidInput("removeLineItem")),
      Effect.flatMap(CurrentCart.removeLineItem),
      Effect.tapError((error) =>
        Effect.logError("Current Cart mutation failed", error).pipe(
          Effect.annotateLogs({
            operation: "currentCart.removeLineItem",
          })
        )
      )
    )
);

export const removeCartItem = NextCommerce.build(removeCartItemProgram, {
  transform: (effect) =>
    effect.pipe(
      Effect.catchTags(cartRequestFailureCases("removeLineItem")),
      encodeActionResult(RemoveCartLineItemActionResult)
    ),
});
