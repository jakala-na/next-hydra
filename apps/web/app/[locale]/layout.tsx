import { LivePreview } from "@repo/cms/components/live-preview";
import { getNavigation } from "@repo/cms/lib/navigation";
import { domainError, Err, Ok } from "@repo/commerce/lib/utils/errors";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import { CartProvider } from "@repo/design-system/components/commerce/providers/cart-context";
import { CartButtonClient } from "@repo/design-system/components/layout/cart-button";
import { MobileMenu } from "@repo/design-system/components/layout/mobile-menu";
import { Navigation } from "@repo/design-system/components/layout/navigation";
import { RegionSelector } from "@repo/design-system/components/layout/region-selector";
import { SearchAutocomplete } from "@repo/design-system/components/layout/search-autocomplete";
import { SiteHeader } from "@repo/design-system/components/layout/site-header";
import {
  hasLocale,
  NextIntlClientProvider,
  setRequestLocale,
} from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import type { Locale } from "@repo/i18n/types";
import { Effect, Option } from "effect";
import { ShoppingCart } from "lucide-react";
import { draftMode, headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccountMenuClient } from "@/components/layout/account-menu-client";
import { BusinessUnitSwitcher } from "@/components/layout/business-unit-switcher";
import { runCurrentCartRead } from "@/lib/current-cart";
import {
  addToCart,
  changeCartItemsQuantity,
  removeCartItem,
} from "./cart-actions";

async function getCart(locale: Locale) {
  try {
    const result = await runCurrentCartRead(
      locale,
      Effect.result(
        Effect.flatMap(CurrentCart, (currentCart) => currentCart.get())
      )
    );
    if (result._tag === "Failure") {
      return Err(
        domainError<object>(
          "UNKNOWN",
          "Failed to read Current Cart",
          undefined,
          result.failure
        )
      );
    }
    return Option.match(result.success, {
      onNone: () => Err(domainError("NOT_FOUND", "Current Cart not found")),
      onSome: Ok,
    });
  } catch (cause) {
    return Err(
      domainError<object>(
        "UNKNOWN",
        "Failed to read Current Cart",
        undefined,
        cause
      )
    );
  }
}

function CartButtonSkeleton() {
  return (
    <div className="relative">
      <div className="flex h-10 w-10 items-center justify-center">
        <ShoppingCart className="h-5 w-5 text-muted-foreground" />
      </div>
    </div>
  );
}

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }));

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const { isEnabled: isDraftModeEnabled } = await draftMode();
  const livePreviewHash = isDraftModeEnabled
    ? ((await headers()).get("x-live-preview") ?? "")
    : "";
  const navigation = await getNavigation(locale, livePreviewHash);
  // Start cart loading here and pass the promise down so leaf nodes can resolve it later.
  const cartPromise = getCart(locale);

  return (
    <NextIntlClientProvider>
      <CartProvider
        cartPromise={cartPromise}
        actions={{
          addToCart,
          changeCartItemsQuantity,
          removeCartItem,
        }}
      >
        <SiteHeader
          MainNavigation={
            <Navigation navigationItems={navigation.navigationItems} />
          }
          RegionSelectorSlot={
            <Suspense fallback={<div className="skeleton h-8 w-16" />}>
              <RegionSelector />
            </Suspense>
          }
          Search={<SearchAutocomplete />}
          BusinessUnitSwitcher={
            <Suspense fallback={<div className="skeleton h-8 w-16" />}>
              <BusinessUnitSwitcher />
            </Suspense>
          }
          MobileMenuSlot={
            <MobileMenu
              key="menu-slot"
              navigationItems={navigation.navigationItems}
            />
          }
          CartSlot={
            <Suspense fallback={<CartButtonSkeleton />}>
              <CartButtonClient />
            </Suspense>
          }
          AccountSlot={<AccountMenuClient />}
        />
        {children}
        <LivePreview isEnabled={isDraftModeEnabled} />
      </CartProvider>
    </NextIntlClientProvider>
  );
}
