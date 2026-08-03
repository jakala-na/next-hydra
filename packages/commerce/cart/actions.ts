"use server";

import { getLocale } from "@repo/i18n";
import { log } from "@repo/observability/log";
import { Effect } from "effect";
import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action";
import { z } from "zod";
import { commerceRequestLayer } from "../commerce-context/request";
import { LineItemId, ProductId, VariantId } from "../domain/cart";
import { CurrentCart } from "../services/current-cart";
import { toCurrentCartMutationData } from "./action-result";
import { type AddToCartData, addToCartInputSchema } from "./add-to-cart";
import {
  type ChangeCartItemsQuantityData,
  changeCartItemsQuantityInputSchema,
} from "./change-cart-items-quantity";
import {
  type RemoveCartItemData,
  removeCartItemInputSchema,
} from "./remove-cart-item";

const cartAction = createSafeActionClient({
  handleServerError: (error) => {
    log.error(`Action server error occurred: ${error.message}`, {
      details: error,
    });
    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
  defineMetadataSchema: () =>
    z.object({
      actionName: z.string(),
    }),
});

export const addToCart = cartAction
  .metadata({ actionName: "addToCart" })
  .inputSchema(addToCartInputSchema)
  .action(
    async ({
      parsedInput: { productId, variantId, quantity },
    }): Promise<AddToCartData> => {
      const locale = await getLocale();
      const layer = await commerceRequestLayer(locale);
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

export const changeCartItemsQuantity = cartAction
  .metadata({ actionName: "changeCartItemsQuantity" })
  .inputSchema(changeCartItemsQuantityInputSchema)
  .action(
    async ({
      parsedInput: { lineItemId, quantity },
    }): Promise<ChangeCartItemsQuantityData> => {
      const locale = await getLocale();
      const layer = await commerceRequestLayer(locale);
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

export const removeCartItem = cartAction
  .metadata({ actionName: "removeCartItem" })
  .inputSchema(removeCartItemInputSchema)
  .action(
    async ({ parsedInput: { lineItemId } }): Promise<RemoveCartItemData> => {
      const locale = await getLocale();
      const layer = await commerceRequestLayer(locale);
      const result = await Effect.runPromise(
        CurrentCart.removeLineItem({
          lineItemId: LineItemId.make(lineItemId),
        }).pipe(
          Effect.provide(layer),
          Effect.tapError((error) =>
            Effect.logError("Current Cart mutation failed", error).pipe(
              Effect.annotateLogs({
                operation: "currentCart.removeLineItem",
              })
            )
          ),
          Effect.result
        )
      );
      return toCurrentCartMutationData(result);
    }
  );
