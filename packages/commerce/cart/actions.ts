"use server";

import { getLocale } from "@repo/i18n";
import { Effect, Schema } from "effect";
import { commerceRequestLayer } from "../commerce-context/request";
import { CartProviderFailure } from "../domain/cart-errors";
import type { CommerceAccountError } from "../services/commerce-accounts";
import type { CommerceRequestFailure } from "../services/commerce-identity";
import { CurrentCart } from "../services/current-cart";
import {
  AddToCartActionResult,
  CartActionInvalidInput,
  type CartActionOperation,
  encodeActionResult,
  RemoveCartLineItemActionResult,
  SetCartLineItemQuantityActionResult,
} from "./action-result";
import {
  type AddToCartData,
  type AddToCartInput,
  AddToCartInputSchema,
} from "./add-to-cart";
import {
  type ChangeCartItemsQuantityData,
  type ChangeCartItemsQuantityInput,
  ChangeCartItemsQuantityInputSchema,
} from "./change-cart-items-quantity";
import {
  type RemoveCartItemData,
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

export async function addToCart(input: AddToCartInput): Promise<AddToCartData> {
  const locale = await getLocale();
  const layer = await commerceRequestLayer(locale);

  const mutation = Schema.decodeUnknownEffect(AddToCartInputSchema)(input).pipe(
    Effect.mapError(() => invalidInput("addItem")),
    Effect.flatMap(CurrentCart.addItem),
    Effect.tapError((error) =>
      Effect.logError("Current Cart mutation failed", error).pipe(
        Effect.annotateLogs({ operation: "currentCart.addItem" })
      )
    ),
    Effect.provide(layer)
  );

  return Effect.runPromise(
    Effect.catchTags(mutation, cartRequestFailureCases("addItem")).pipe(
      encodeActionResult(AddToCartActionResult)
    )
  );
}

export async function changeCartItemsQuantity(
  input: ChangeCartItemsQuantityInput
): Promise<ChangeCartItemsQuantityData> {
  const locale = await getLocale();
  const layer = await commerceRequestLayer(locale);

  const mutation = Schema.decodeUnknownEffect(
    ChangeCartItemsQuantityInputSchema
  )(input).pipe(
    Effect.mapError(() => invalidInput("setLineItemQuantity")),
    Effect.flatMap(CurrentCart.setLineItemQuantity),
    Effect.tapError((error) =>
      Effect.logError("Current Cart mutation failed", error).pipe(
        Effect.annotateLogs({
          operation: "currentCart.setLineItemQuantity",
        })
      )
    ),
    Effect.provide(layer)
  );

  return Effect.runPromise(
    Effect.catchTags(
      mutation,
      cartRequestFailureCases("setLineItemQuantity")
    ).pipe(encodeActionResult(SetCartLineItemQuantityActionResult))
  );
}

export async function removeCartItem(
  input: RemoveCartItemInput
): Promise<RemoveCartItemData> {
  const locale = await getLocale();
  const layer = await commerceRequestLayer(locale);

  const mutation = Schema.decodeUnknownEffect(RemoveCartItemInputSchema)(
    input
  ).pipe(
    Effect.mapError(() => invalidInput("removeLineItem")),
    Effect.flatMap(CurrentCart.removeLineItem),
    Effect.tapError((error) =>
      Effect.logError("Current Cart mutation failed", error).pipe(
        Effect.annotateLogs({
          operation: "currentCart.removeLineItem",
        })
      )
    ),
    Effect.provide(layer)
  );

  return Effect.runPromise(
    Effect.catchTags(mutation, cartRequestFailureCases("removeLineItem")).pipe(
      encodeActionResult(RemoveCartLineItemActionResult)
    )
  );
}
