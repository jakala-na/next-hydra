import type { AddToCartInput } from "@repo/commerce/contracts/actions/add-to-cart";
import type { ChangeCartItemsQuantityInput } from "@repo/commerce/contracts/actions/change-cart-items-quantity";
import type { RemoveCartItemInput } from "@repo/commerce/contracts/actions/remove-cart-item";
import { LineItemId, ProductId, VariantId } from "@repo/commerce/domain/cart";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import { Effect } from "effect";

export const addToCurrentCart = (input: AddToCartInput) =>
  Effect.flatMap(CurrentCart, (currentCart) =>
    currentCart.addItem({
      productId: ProductId.make(input.productId),
      variantId: VariantId.make(input.variantId),
      quantity: input.quantity,
    })
  );

export const setCurrentCartLineItemQuantity = (
  input: ChangeCartItemsQuantityInput
) =>
  Effect.flatMap(CurrentCart, (currentCart) =>
    currentCart.setLineItemQuantity({
      lineItemId: LineItemId.make(input.lineItemId),
      quantity: input.quantity,
    })
  );

export const removeCurrentCartLineItem = (input: RemoveCartItemInput) =>
  Effect.flatMap(CurrentCart, (currentCart) =>
    currentCart.removeLineItem({
      lineItemId: LineItemId.make(input.lineItemId),
    })
  );
