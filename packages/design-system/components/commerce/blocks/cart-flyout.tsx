"use client";

import type { Money } from "@repo/commerce/domain/money";
import { CartSummary } from "@repo/design-system/components/commerce/blocks/cart-summary";
import { useCart } from "@repo/design-system/components/commerce/providers/cart-context";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { useFormatter, useTranslations } from "@repo/i18n";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

// SAFETY: Locale routing resolves this temporary destination at runtime while the generated Route union cannot represent it yet.
const PRODUCTS_ROUTE = "/products" as Route;
// SAFETY: Locale routing resolves this Cart destination at runtime while the generated Route union cannot represent it yet.
const CART_ROUTE = "/cart" as Route;
// SAFETY: Locale routing resolves this Checkout destination at runtime while the generated Route union requires a locale-prefixed path.
const CHECKOUT_ROUTE = "/checkout" as Route;

export function CartFlyout() {
  const {
    items,
    summary,
    totalItems,
    removeItem,
    updateQuantity,
    isOpen,
    closeCart,
  } = useCart();

  const format = useFormatter();
  const t = useTranslations("web.cart");

  const formatPrice = (price: Money) =>
    format.number(price.centAmount / 100, "wholeMoneyWithCurrency", {
      currency: price.currencyCode,
    });

  return (
    <Sheet open={isOpen} onOpenChange={closeCart}>
      <SheetContent className="flex w-full flex-col gap-6 p-6 sm:max-w-lg">
        <SheetHeader className="p-0">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            {t("title", { count: totalItems })}
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            <ShoppingBag className="mb-4 h-16 w-16 text-muted-foreground" />
            <h3 className="mb-2 font-semibold text-lg">{t("empty.heading")}</h3>
            <p className="mb-6 text-muted-foreground">
              {t("empty.description")}
            </p>
            <div className="grid w-full max-w-xs gap-2">
              <Button onClick={closeCart} asChild>
                {/* @todo: implement products page */}
                <Link href={PRODUCTS_ROUTE}>
                  {t("empty.actions.browseProducts")}
                </Link>
              </Button>
              <Button variant="outline" onClick={closeCart} asChild>
                <Link href={CART_ROUTE}>{t("actions.viewCart")}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto">
              {items.map((item) => (
                <div
                  data-cart-line-item=""
                  key={item.id}
                  className="flex gap-4 rounded-lg border bg-card p-4"
                >
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                    <Image
                      src={item.image?.url ?? "/placeholder.svg"}
                      alt={item.name}
                      fill
                      className="object-cover"
                    />
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold leading-tight">
                          {item.name}
                        </h4>
                        {item.summaryAttribute === undefined ? null : (
                          <p className="text-muted-foreground text-sm">
                            {item.summaryAttribute.label}:{" "}
                            {item.summaryAttribute.value}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          void removeItem(item.id);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 bg-transparent"
                          onClick={() => {
                            void updateQuantity(item.id, item.quantity - 1);
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-medium">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 bg-transparent"
                          onClick={() => {
                            void updateQuantity(item.id, item.quantity + 1);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="font-bold">{formatPrice(item.lineTotal)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4 border-t pt-6">
              {summary === undefined ? null : (
                <CartSummary summary={summary} surface="cart" />
              )}

              <div className="space-y-2">
                <Button className="h-12 w-full" size="lg" asChild>
                  <Link href={CHECKOUT_ROUTE} onClick={closeCart}>
                    {t("actions.checkout")}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  asChild
                >
                  <Link href={CART_ROUTE} onClick={closeCart}>
                    {t("actions.viewCart")}
                  </Link>
                </Button>
                <Button variant="ghost" className="w-full" onClick={closeCart}>
                  {t("actions.continueShopping")}
                </Button>
              </div>

              <p className="text-center text-muted-foreground text-xs">
                {t("summary.taxesAndShippingNotice")}
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
