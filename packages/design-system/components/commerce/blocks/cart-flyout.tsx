"use client";

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

export function CartFlyout() {
  const {
    items,
    totalItems,
    totalPrice,
    removeItem,
    updateQuantity,
    isOpen,
    closeCart,
    currencyCode,
  } = useCart();

  const format = useFormatter();
  const t = useTranslations("web.cart");

  const formatPrice = (price: number) =>
    format.number(price, "wholeMoneyWithCurrency", {
      currency: currencyCode,
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
            <Button onClick={closeCart} asChild>
              {/* @todo: implement products page and remove type assertion */}
              <Link href={"/products" as Route}>
                {t("empty.actions.browseProducts")}
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 rounded-lg border bg-card p-4"
                >
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                    <Image
                      src={item.image || "/placeholder.svg"}
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
                        <p className="text-muted-foreground text-sm">
                          {item.variant}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeItem(item.id)}
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
                          onClick={() =>
                            updateQuantity(item.id, item.quantity - 1)
                          }
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
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="font-bold">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4 border-t pt-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("summary.subtotal.label")}
                  </span>
                  <span className="font-medium">{formatPrice(totalPrice)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("summary.shipping.label")}
                  </span>
                  <span className="font-medium">
                    {t("summary.shipping.description")}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold text-lg">
                  <span>{t("summary.total.label")}</span>
                  <span>{formatPrice(totalPrice)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Button className="h-12 w-full" size="lg" asChild>
                  {/* @todo: implement checkout page and remove type assertion */}
                  <Link href={"/checkout" as Route}>
                    {t("actions.checkout")}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={closeCart}
                >
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
