"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { ShoppingCart } from "lucide-react";

import { CartFlyout } from "../commerce/blocks/cart-flyout";
import { useCartData, useCartState } from "../commerce/providers/cart-context";

/**
 * CartButtonClient - renders cart icon with item count.
 * This component MUST be wrapped in Suspense because it uses useCartData()
 * which calls use() to resolve the cart promise.
 */
export function CartButtonClient() {
  // This causes suspension until cart promise resolves
  const cartData = useCartData();
  const { isOpen, openCart } = useCartState();

  // Calculate total items from resolved cart
  const totalItems =
    cartData?.cart?.lineItems?.reduce((sum, item) => sum + item.quantity, 0) ??
    0;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => {
          openCart();
        }}
      >
        <ShoppingCart className="h-5 w-5" />
        {totalItems > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
            {totalItems}
          </span>
        )}
      </Button>
      {isOpen && <CartFlyout />}
    </div>
  );
}
