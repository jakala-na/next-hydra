import { CmsPageLayout, getNavigation } from "@repo/cms/layout";
import { BusinessUnitSwitcher } from "@repo/commerce/commerce-context";
import { CartButtonClient } from "@repo/design-system/components/layout/cart-button";
import { MobileMenu } from "@repo/design-system/components/layout/mobile-menu";
import { Navigation } from "@repo/design-system/components/layout/navigation";
import { RegionSelector } from "@repo/design-system/components/layout/region-selector";
import { SearchAutocomplete } from "@repo/design-system/components/layout/search-autocomplete";
import { SiteFooter } from "@repo/design-system/components/layout/site-footer";
import { SiteHeader } from "@repo/design-system/components/layout/site-header";
import { getLocale, hasLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { ShoppingCart } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";

import {
  AccountMenu,
  AccountMenuSkeleton,
} from "@/components/layout/account-menu";
import { selectBusinessUnit } from "@/lib/commerce-context-actions";

function CartButtonSkeleton() {
  return (
    <div className="relative">
      <div className="flex h-10 w-10 items-center justify-center">
        <ShoppingCart className="h-5 w-5 text-muted-foreground" />
      </div>
    </div>
  );
}

export default async function PageShell({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  if (!hasLocale(routing.locales, locale)) {notFound();}
  const navigation = await getNavigation(locale);
  return (
    <CmsPageLayout
      locale={locale}
      footer={<SiteFooter />}
      header={
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
              <BusinessUnitSwitcher
                locale={locale}
                onSwitchBusinessUnit={selectBusinessUnit}
              />
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
      }
    >
      {children}
    </CmsPageLayout>
  );
}
