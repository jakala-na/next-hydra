"use server";

import {
  type RemoveCartItemData,
  removeCartItemInputSchema,
} from "@repo/commerce/contracts/actions/remove-cart-item";
import { removeItemFromCart } from "@repo/commerce/lib/cart/cart.repo";
import { validateCartPolicies } from "@repo/commerce/lib/cart/utils/validate-cart";
import { domainError, Err, isOk, Ok } from "@repo/commerce/lib/utils/errors";
import { inStoreAction } from "@repo/commerce/lib/utils/safe-action";
import { getCartForContext } from "../lib/cart/utils/get-cart";

export const removeCartItem = inStoreAction
  .metadata({ actionName: "removeCartItem" })
  .inputSchema(removeCartItemInputSchema)
  .action(
    async ({
      parsedInput: { lineItemId },
      ctx,
    }): Promise<RemoveCartItemData> => {
      const cartWithIssues = await getCartForContext(ctx);

      if (!isOk(cartWithIssues)) {
        return Err(cartWithIssues.error);
      }

      const cart = cartWithIssues.data.cart;

      const updateCartResult = await removeItemFromCart({
        id: cart.id,
        version: cart.version,
        lineItemId,
        locale: ctx.locale,
      });

      if (!isOk(updateCartResult)) {
        return Err(domainError("UNKNOWN", "Failed to remove item from cart"));
      }

      const updatedCart = updateCartResult.data;

      // Validate cart policies
      const issues = await validateCartPolicies({
        cart: updatedCart,
        locale: ctx.locale,
      });

      return Ok({
        cart: updatedCart,
        issues,
        currency: ctx.currency,
      });
    }
  );
