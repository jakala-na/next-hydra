"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { CartFlyout } from "../commerce/blocks/cart-flyout";
import { useCart } from "../commerce/providers/cart-context";

export function CartButtonClient() {
  const { isOpen, openCart, totalItems } = useCart();

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => openCart()}
      >
        <ShoppingCart className="h-5 w-5" />
        {totalItems > 0 && (
          <span className="-right-1 -top-1 absolute flex h-5 w-5 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
            {totalItems}
          </span>
        )}
      </Button>
      {isOpen && <CartFlyout />}
    </div>
  );
}
