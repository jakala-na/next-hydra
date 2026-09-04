"use client";

import type { CartPublicState } from "@repo/commerce/cart/public-state";
import type { Money } from "@repo/commerce/domain/money";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { CartSummary } from "@repo/design-system/components/commerce/blocks/cart-summary";
import { useCart } from "@repo/design-system/components/commerce/providers/cart-context";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { useFormatter, useTranslations } from "@repo/i18n";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

// SAFETY: Locale routing resolves this Checkout destination at runtime while the generated Route union cannot represent it yet.
const CHECKOUT_ROUTE = "/checkout" as Route;
// SAFETY: Locale routing resolves this Products destination at runtime while the generated Route union cannot represent it yet.
const PRODUCTS_ROUTE = "/products" as Route;

const MINOR_UNITS_PER_UNIT = 100;

interface CartPageViewProps {
  readonly initialCart: CartPublicState | null;
}

interface CartPageBoundaryProps {
  readonly children: ReactNode;
}

function CartPageBoundary({ children }: CartPageBoundaryProps) {
  return (
    <ArchitectureBoundary
      component="client"
      description="Shows the current Cart state and keeps Cart actions synchronized with the shared site header."
      layer="interactive"
      layerLabel="Interactive Cart page"
      name="CartPage"
      rendering="streamed"
      source="design-system"
      sourceLabel="Shared design system"
    >
      {children}
    </ArchitectureBoundary>
  );
}

export function CartPageView({ initialCart }: CartPageViewProps) {
  const { items, removeItem, summary, totalItems, updateQuantity } =
    useCart(initialCart);
  const [pendingLineItemId, setPendingLineItemId] = useState<string>();
  const format = useFormatter();
  const t = useTranslations("web.cart");

  const formatPrice = (price: Money) =>
    format.number(
      price.centAmount / MINOR_UNITS_PER_UNIT,
      "wholeMoneyWithCurrency",
      {
        currency: price.currencyCode,
      }
    );

  const updateLineItem = async (id: string, quantity: number) => {
    setPendingLineItemId(id);
    try {
      await updateQuantity(id, quantity);
    } finally {
      setPendingLineItemId(undefined);
    }
  };

  const removeLineItem = async (id: string) => {
    setPendingLineItemId(id);
    try {
      await removeItem(id);
    } finally {
      setPendingLineItemId(undefined);
    }
  };

  if (items.length === 0) {
    return (
      <CartPageBoundary>
        <main
          className="container mx-auto flex min-h-[60vh] max-w-4xl items-center justify-center px-4 py-16 sm:px-6"
          data-cart-page=""
        >
          <section className="flex max-w-lg flex-col items-center text-center">
            <span className="mb-6 flex size-24 items-center justify-center rounded-full bg-muted">
              <ShoppingBag
                aria-hidden="true"
                className="size-11 text-muted-foreground"
              />
            </span>
            <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
              {t("empty.heading")}
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              {t("empty.description")}
            </p>
            <Button className="mt-8" size="lg" asChild>
              <Link href={PRODUCTS_ROUTE}>
                {t("empty.actions.browseProducts")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </section>
        </main>
      </CartPageBoundary>
    );
  }

  return (
    <CartPageBoundary>
      <main
        className="container mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
        data-cart-page=""
      >
        <header className="mb-8">
          <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
            {t("title", { count: totalItems })}
          </h1>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-4" aria-label={t("items.heading")}>
            {items.map((item) => {
              const isPending = pendingLineItemId === item.id;
              return (
                <Card
                  className="overflow-hidden py-0"
                  data-cart-page-line-item=""
                  key={item.id}
                >
                  <CardContent className="grid gap-5 p-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-6">
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                      {item.image ? (
                        <Image
                          alt={item.name}
                          className="object-cover"
                          fill
                          sizes="(max-width: 640px) 100vw, 144px"
                          src={item.image.url}
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center">
                          <ShoppingBag
                            aria-hidden="true"
                            className="size-10 text-muted-foreground"
                          />
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-col gap-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="font-semibold text-xl leading-tight">
                            {item.name}
                          </h2>
                          {item.summaryAttribute === undefined ? null : (
                            <p className="mt-1 text-muted-foreground text-sm">
                              {item.summaryAttribute.label}:{" "}
                              {item.summaryAttribute.value}
                            </p>
                          )}
                        </div>
                        <Button
                          aria-label={t("items.removeLabel", {
                            product: item.name,
                          })}
                          disabled={isPending}
                          onClick={() => {
                            void removeLineItem(item.id);
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          <Trash2 aria-hidden="true" />
                          {t("actions.remove")}
                        </Button>
                      </div>

                      <dl className="grid grid-cols-2 gap-4 text-sm sm:max-w-sm">
                        <div>
                          <dt className="text-muted-foreground">
                            {t("items.unitPrice")}
                          </dt>
                          <dd
                            className="mt-1 font-medium"
                            data-commerce-money="cart-page-unit-price"
                            data-currency={item.unitPrice.currencyCode}
                            data-minor-amount={item.unitPrice.centAmount}
                          >
                            {formatPrice(item.unitPrice)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            {t("items.lineTotal")}
                          </dt>
                          <dd
                            className="mt-1 font-semibold"
                            data-commerce-money="cart-page-line-total"
                            data-currency={item.lineTotal.currencyCode}
                            data-minor-amount={item.lineTotal.centAmount}
                          >
                            {formatPrice(item.lineTotal)}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-auto flex items-end justify-between gap-4">
                        <div>
                          <p className="mb-2 text-muted-foreground text-sm">
                            {t("items.quantity")}
                          </p>
                          <div className="inline-flex items-center rounded-md border bg-background shadow-xs">
                            <Button
                              aria-label={t("items.decreaseQuantity", {
                                product: item.name,
                              })}
                              className="rounded-r-none border-0 shadow-none"
                              disabled={isPending || item.quantity <= 1}
                              onClick={() => {
                                void updateLineItem(item.id, item.quantity - 1);
                              }}
                              size="icon"
                              variant="ghost"
                            >
                              <Minus aria-hidden="true" />
                            </Button>
                            <output
                              aria-label={t("items.quantityLabel", {
                                product: item.name,
                              })}
                              className="min-w-10 px-2 text-center font-medium tabular-nums"
                              data-cart-page-quantity=""
                            >
                              {item.quantity}
                            </output>
                            <Button
                              aria-label={t("items.increaseQuantity", {
                                product: item.name,
                              })}
                              className="rounded-l-none border-0 shadow-none"
                              disabled={isPending}
                              onClick={() => {
                                void updateLineItem(item.id, item.quantity + 1);
                              }}
                              size="icon"
                              variant="ghost"
                            >
                              <Plus aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <Card className="lg:sticky lg:top-24" data-cart-page-summary="">
            <CardHeader>
              <CardTitle className="text-xl">{t("summary.heading")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {summary === undefined ? null : (
                <CartSummary summary={summary} surface="cart-page" />
              )}

              <Button className="h-11 w-full" size="lg" asChild>
                <Link href={CHECKOUT_ROUTE}>
                  {t("actions.checkout")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link href={PRODUCTS_ROUTE}>
                  {t("actions.continueShopping")}
                </Link>
              </Button>
              <p className="text-center text-muted-foreground text-xs">
                {t("summary.taxesAndShippingNotice")}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </CartPageBoundary>
  );
}
