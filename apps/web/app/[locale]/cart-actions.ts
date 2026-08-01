"use server";

import {
  type AddToCartData,
  addToCartInputSchema,
} from "@repo/commerce/contracts/actions/add-to-cart";
import {
  type ChangeCartItemsQuantityData,
  changeCartItemsQuantityInputSchema,
} from "@repo/commerce/contracts/actions/change-cart-items-quantity";
import {
  type RemoveCartItemData,
  removeCartItemInputSchema,
} from "@repo/commerce/contracts/actions/remove-cart-item";
import { domainError, Err, Ok } from "@repo/commerce/lib/utils/errors";
import { inStoreAction } from "@repo/commerce/lib/utils/safe-action";
import type { CurrentCart } from "@repo/commerce/services/current-cart";
import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";
import { runCurrentCartWrite } from "@/lib/current-cart";
import {
  addToCurrentCart,
  removeCurrentCartLineItem,
  setCurrentCartLineItemQuantity,
} from "@/lib/current-cart-action-programs";

const runMutation = async <A, E>(
  locale: Locale,
  mutation: Effect.Effect<A, E, CurrentCart>
) => {
  const result = await runCurrentCartWrite(locale, Effect.result(mutation));
  return result._tag === "Success"
    ? Ok(result.success)
    : Err(
        domainError<object>(
          "UNKNOWN",
          "Current Cart mutation failed",
          undefined,
          result.failure
        )
      );
};

export const addToCart = inStoreAction
  .metadata({ actionName: "addToCart" })
  .inputSchema(addToCartInputSchema)
  .action(
    async ({
      parsedInput: { productId, variantId, quantity },
      ctx,
    }): Promise<AddToCartData> =>
      runMutation(
        ctx.locale,
        addToCurrentCart({ productId, variantId, quantity })
      )
  );

export const changeCartItemsQuantity = inStoreAction
  .metadata({ actionName: "changeCartItemsQuantity" })
  .inputSchema(changeCartItemsQuantityInputSchema)
  .action(
    async ({
      parsedInput: { lineItemId, quantity },
      ctx,
    }): Promise<ChangeCartItemsQuantityData> =>
      runMutation(
        ctx.locale,
        setCurrentCartLineItemQuantity({ lineItemId, quantity })
      )
  );

export const removeCartItem = inStoreAction
  .metadata({ actionName: "removeCartItem" })
  .inputSchema(removeCartItemInputSchema)
  .action(
    async ({ parsedInput: { lineItemId }, ctx }): Promise<RemoveCartItemData> =>
      runMutation(ctx.locale, removeCurrentCartLineItem({ lineItemId }))
  );
