"use server";

import {
  type ChangeCartItemsQuantityData,
  changeCartItemsQuantityInputSchema,
} from "@repo/commerce/contracts/actions/change-cart-items-quantity";
import { changeItemQuantity } from "@repo/commerce/lib/cart/cart.repo";
import { validateCartPolicies } from "@repo/commerce/lib/cart/utils/validate-cart";
import { domainError, Err, isOk, Ok } from "@repo/commerce/lib/utils/errors";
import { inStoreAction } from "@repo/commerce/lib/utils/safe-action";
import { getCartForContext } from "../lib/cart/utils/get-cart";

export const changeCartItemsQuantity = inStoreAction
  .metadata({ actionName: "changeCartItemsQuantity" })
  .inputSchema(changeCartItemsQuantityInputSchema)
  .action(
    async ({
      parsedInput: { lineItemId, quantity },
      ctx,
    }): Promise<ChangeCartItemsQuantityData> => {
      const cartWithIssues = await getCartForContext(ctx);

      if (!isOk(cartWithIssues)) {
        return Err(cartWithIssues.error);
      }

      const cart = cartWithIssues.data.cart;

      const updateCartResult = await changeItemQuantity({
        id: cart.id,
        version: cart.version,
        lineItemId,
        quantity,
        locale: ctx.locale,
      });

      if (!isOk(updateCartResult)) {
        return Err(domainError("UNKNOWN", "Failed to change item quantity"));
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
