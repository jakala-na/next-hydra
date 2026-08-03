"use server";

import { commerceRequestLayer } from "@repo/commerce/commerce-context/request";
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
import { LineItemId, ProductId, VariantId } from "@repo/commerce/domain/cart";
import { inStoreAction } from "@repo/commerce/lib/utils/safe-action";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import { Effect } from "effect";
import { toCurrentCartMutationData } from "@/lib/current-cart-action-result";

export const addToCart = inStoreAction
  .metadata({ actionName: "addToCart" })
  .inputSchema(addToCartInputSchema)
  .action(
    async ({
      parsedInput: { productId, variantId, quantity },
      ctx,
    }): Promise<AddToCartData> => {
      const layer = await commerceRequestLayer(ctx.locale);
      const result = await Effect.runPromise(
        CurrentCart.addItem({
          productId: ProductId.make(productId),
          variantId: VariantId.make(variantId),
          quantity,
        }).pipe(
          Effect.provide(layer),
          Effect.tapError((error) =>
            Effect.logError("Current Cart mutation failed", error).pipe(
              Effect.annotateLogs({ operation: "currentCart.addItem" })
            )
          ),
          Effect.result
        )
      );
      return toCurrentCartMutationData(result);
    }
  );

export const changeCartItemsQuantity = inStoreAction
  .metadata({ actionName: "changeCartItemsQuantity" })
  .inputSchema(changeCartItemsQuantityInputSchema)
  .action(
    async ({
      parsedInput: { lineItemId, quantity },
      ctx,
    }): Promise<ChangeCartItemsQuantityData> => {
      const layer = await commerceRequestLayer(ctx.locale);
      const result = await Effect.runPromise(
        CurrentCart.setLineItemQuantity({
          lineItemId: LineItemId.make(lineItemId),
          quantity,
        }).pipe(
          Effect.provide(layer),
          Effect.tapError((error) =>
            Effect.logError("Current Cart mutation failed", error).pipe(
              Effect.annotateLogs({
                operation: "currentCart.setLineItemQuantity",
              })
            )
          ),
          Effect.result
        )
      );
      return toCurrentCartMutationData(result);
    }
  );

export const removeCartItem = inStoreAction
  .metadata({ actionName: "removeCartItem" })
  .inputSchema(removeCartItemInputSchema)
  .action(
    async ({
      parsedInput: { lineItemId },
      ctx,
    }): Promise<RemoveCartItemData> => {
      const layer = await commerceRequestLayer(ctx.locale);
      const result = await Effect.runPromise(
        CurrentCart.removeLineItem({
          lineItemId: LineItemId.make(lineItemId),
        }).pipe(
          Effect.provide(layer),
          Effect.tapError((error) =>
            Effect.logError("Current Cart mutation failed", error).pipe(
              Effect.annotateLogs({ operation: "currentCart.removeLineItem" })
            )
          ),
          Effect.result
        )
      );
      return toCurrentCartMutationData(result);
    }
  );
