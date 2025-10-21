"use server";

import {
  type AddToCartData,
  addToCartInputSchema,
} from "@repo/commerce/contracts/actions/add-to-cart";
import { cartService } from "@repo/commerce/lib/cart/cart.service";
import { setAnonymousCartId } from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { validateCartPolicies } from "@repo/commerce/lib/cart/utils/validate-cart";
import type { Cart } from "@repo/commerce/lib/types";
import { domainError, Err, isOk, Ok } from "@repo/commerce/lib/utils/errors";
import { inStoreAction } from "@repo/commerce/lib/utils/safe-action";
import { getCartForContext } from "../lib/cart/utils/get-cart";

export const addToCart = inStoreAction
  .metadata({ actionName: "addToCart" })
  .inputSchema(addToCartInputSchema)
  .action(
    async ({
      parsedInput: { productId, variantId, quantity },
      ctx,
    }): Promise<AddToCartData> => {
      let cart: Cart | null = null;

      // Get existing cart.
      const cartResult = await getCartForContext(ctx);
      if (isOk(cartResult)) {
        cart = cartResult.data.cart;
      }

      // Create cart if it doesn't exist.
      if (!cart) {
        const createResult = await cartService.createCart({
          locale: ctx.locale,
        });
        if (isOk(createResult)) {
          cart = createResult.data;
          if (cart !== null) {
            await setAnonymousCartId(cart.id, ctx.locale);
          }
        }
      }

      // If cart doesn't exist, return error.
      if (!cart) {
        return Err(domainError("UNKNOWN", "Failed to create cart"));
      }

      // Proceed to add item to cart.
      const updatedCartResult = await cartService.addItemToCart({
        id: cart.id,
        version: cart.version,
        // TODO: Why convert variantId to string to convert to number back?
        variantId: Number.parseInt(variantId, 10),
        quantity,
        productId,
        locale: ctx.locale,
      });

      if (!isOk(updatedCartResult)) {
        return Err(domainError("UNKNOWN", "Failed to add item to cart"));
      }

      const updatedCart = updatedCartResult.data;

      // Validate cart policies
      const issues = await validateCartPolicies({
        cart: updatedCart,
        locale: ctx.locale,
      });

      return Ok({
        cart: updatedCart,
        currency: ctx.currency,
        issues,
      });
    }
  );
