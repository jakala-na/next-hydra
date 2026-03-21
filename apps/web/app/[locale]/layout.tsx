import { LivePreview } from "@repo/cms/components/live-preview";
import { getNavigation } from "@repo/cms/lib/navigation";
import { addToCart } from "@repo/commerce/actions/add-to-cart";
import { changeCartItemsQuantity } from "@repo/commerce/actions/change-cart-items-quantity";
import { removeCartItem } from "@repo/commerce/actions/remove-cart-item";
import { getCartForContext } from "@repo/commerce/lib/cart/utils/get-cart";
import { storeService } from "@repo/commerce/lib/store/store.service";
import { CartProvider } from "@repo/design-system/components/commerce/providers/cart-context";
import { AccountMenuClient } from "@repo/design-system/components/layout/account-menu";
import { BusinessUnitSwitcher } from "@repo/design-system/components/layout/business-unit-switcher";
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
import { ShoppingCart } from "lucide-react";
import { draftMode, headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";

async function getCart(locale: Locale) {
  const context = await storeService.getStoreContextByLocale(locale);
  return getCartForContext(context);
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
