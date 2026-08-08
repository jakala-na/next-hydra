import { LivePreview } from "@repo/cms/components/live-preview";
import { getNavigation } from "@repo/cms/lib/navigation";
import { CommerceCartProvider } from "@repo/commerce/cart";
import { BusinessUnitSwitcher } from "@repo/commerce/commerce-context";
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
import { ShoppingCart } from "lucide-react";
import { draftMode, headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AccountMenu,
  AccountMenuSkeleton,
} from "@/components/layout/account-menu";

export const instant = false;

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
  return (
    <NextIntlClientProvider>
      <CommerceCartProvider locale={locale}>
        <SiteHeader
          MainNavigation={
            <Navigation navigationItems={navigation.navigationItems} />
          }
          RegionSelectorSlot={
            <Suspense
              fallback={
                <div className="h-8 w-16 animate-pulse rounded bg-accent-foreground/15" />
              }
            >
              <RegionSelector />
            </Suspense>
          }
          Search={<SearchAutocomplete />}
          BusinessUnitSwitcher={
            <Suspense
              fallback={
                <div className="h-8 w-16 animate-pulse rounded bg-accent-foreground/15" />
              }
            >
              <BusinessUnitSwitcher locale={locale} />
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
          AccountSlot={
            <Suspense fallback={<AccountMenuSkeleton />}>
              <AccountMenu />
            </Suspense>
          }
        />
        {children}
        <LivePreview isEnabled={isDraftModeEnabled} />
      </CommerceCartProvider>
    </NextIntlClientProvider>
  );
}
