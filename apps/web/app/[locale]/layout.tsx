import "./styles.css";
import { LivePreview } from "@repo/cms/components/live-preview";
import { getNavigation } from "@repo/cms/lib/navigation";
import { addToCart } from "@repo/commerce/actions/add-to-cart";
import { changeCartItemsQuantity } from "@repo/commerce/actions/change-cart-items-quantity";
import { removeCartItem } from "@repo/commerce/actions/remove-cart-item";
import { getCartForContext } from "@repo/commerce/lib/cart/utils/get-cart";
import { storeService } from "@repo/commerce/lib/store/store.service";
import { DesignSystemProvider } from "@repo/design-system";
import { CartProvider as DesignSystemCartProvider } from "@repo/design-system/components/commerce/providers/cart-context";
import { AccountMenuClient } from "@repo/design-system/components/layout/account-menu";
import { BusinessUnitSwitcher } from "@repo/design-system/components/layout/business-unit-switcher";
import { CartButtonClient } from "@repo/design-system/components/layout/cart-button";
import { MobileMenu } from "@repo/design-system/components/layout/mobile-menu";
import { Navigation } from "@repo/design-system/components/layout/navigation";
import { RegionSelector } from "@repo/design-system/components/layout/region-selector";
import { SearchAutocomplete } from "@repo/design-system/components/layout/search-autocomplete";
import { SiteHeader } from "@repo/design-system/components/layout/site-header";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import { Toolbar } from "@repo/feature-flags/components/toolbar";
import { hasLocale, NextIntlClientProvider } from "@repo/i18n";
import { regions } from "@repo/i18n/config";
import { routing } from "@repo/i18n/routing";
import { draftMode, headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";

type RootLayoutProperties = {
  readonly children: ReactNode;
  readonly params: Promise<{
    locale: string;
  }>;
};

const RootLayout = async ({ children, params }: RootLayoutProperties) => {
  const { isEnabled: isDraftModeEnabled } = await draftMode();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  let livePreviewHash = "";
  if (isDraftModeEnabled) {
    livePreviewHash = (await headers()).get("x-live-preview") || "";
  }
  const navigation = await getNavigation(locale, livePreviewHash);
  const contextPromise = storeService.getStoreContextByLocale(locale);
  const cartPromise = contextPromise.then((context) =>
    getCartForContext(context)
  );

  return (
    <html
      className={cn(fonts, "scroll-smooth")}
      lang={locale}
      suppressHydrationWarning
    >
      <body>
        <DesignSystemProvider>
          <NextIntlClientProvider>
            <DesignSystemCartProvider
              cartPromise={cartPromise}
              actions={{ addToCart, changeCartItemsQuantity, removeCartItem }}
            >
              <SiteHeader
                MainNavigation={
                  <Navigation navigationItems={navigation.navigationItems} />
                }
                RegionSelectorSlot={<RegionSelector regions={regions} />}
                Search={<SearchAutocomplete />}
                BusinessUnitSwitcher={<BusinessUnitSwitcher />}
                MobileMenuSlot={
                  <MobileMenu
                    key={"menu-slot"}
                    navigationItems={navigation.navigationItems}
                  />
                }
                CartSlot={
                  <Suspense fallback={<div className="skeleton h-8 w-16" />}>
                    <CartButtonClient />
                  </Suspense>
                }
                AccountSlot={<AccountMenuClient />}
              />
              {children}
              {/* <Footer /> */}
              <LivePreview isEnabled={isDraftModeEnabled} />
            </DesignSystemCartProvider>
          </NextIntlClientProvider>
        </DesignSystemProvider>
        <Toolbar />
      </body>
    </html>
  );
};

export default RootLayout;
