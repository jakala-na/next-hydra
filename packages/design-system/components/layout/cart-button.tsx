"use client";

import { isCartUnavailable } from "@repo/commerce/cart/public-state";
import { Button } from "@repo/design-system/components/ui/button";
import { useTranslations } from "@repo/i18n";
import { CircleAlert, ShoppingCart } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { CartFlyout } from "../commerce/blocks/cart-flyout";
import { useCartData, useCartState } from "../commerce/providers/cart-context";

// SAFETY: Locale routing resolves this Cart destination at runtime while the generated Route union cannot represent it yet.
const CART_ROUTE = "/cart" as Route;

/**
 * CartButtonClient - renders cart icon with item count.
 * This component MUST be wrapped in Suspense because it uses useCartData()
 * which calls use() to resolve the cart promise.
 */
export function CartButtonClient() {
  // This causes suspension until cart promise resolves
  const cartData = useCartData();
  const { isOpen, openCart } = useCartState();
  const t = useTranslations("web.cart");

  if (isCartUnavailable(cartData)) {
    return (
      <Button variant="ghost" size="icon" className="relative" asChild>
        <Link aria-label={t("error.controlUnavailable")} href={CART_ROUTE}>
          <ShoppingCart className="h-5 w-5" />
          <CircleAlert
            aria-hidden="true"
            className="absolute -top-1 -right-1 h-4 w-4 text-destructive"
          />
        </Link>
      </Button>
    );
  }

  const totalItems = cartData?.cart.totalLineItemQuantity ?? 0;

  return (
    <div className="relative">
      <Button
        aria-label={t("actions.openCart")}
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
