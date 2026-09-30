import "@/app/[locale]/styles.css";
import {
  CmsPageLayout,
  CmsLayoutIntegration,
  getNavigation,
} from "@repo/cms/layout";
import { MobileMenu } from "@repo/design-system/components/layout/mobile-menu";
import { Navigation } from "@repo/design-system/components/layout/navigation";
import { RegionSelector } from "@repo/design-system/components/layout/region-selector";
import { SiteFooter } from "@repo/design-system/components/layout/site-footer";
import { SiteHeader } from "@repo/design-system/components/layout/site-header";
import { getLocale, hasLocale, NextIntlClientProvider } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";

import { DocumentShell } from "@/components/layout/document-shell";
/*{% echo imports %}*/

export const instant = false;
export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }));

async function PageShell({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const navigation = await getNavigation(locale);
  /*{% if enabled.search %}*/
  const headerSearch = (
    <Suspense fallback={null}>{/*{{ slots.search }}*/}</Suspense>
  );
  /*{% endif %}*/
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
          MobileMenuSlot={
            <MobileMenu
              navigationItems={navigation.navigationItems}
              {...{
                /*{% if enabled.search %}*/
                Search: headerSearch,
                /*{% endif %}*/
              }}
            />
          }
          {...{
            /*{% if enabled.account %}*/
            AccountSlot: (
              <Suspense fallback={null}>{/*{{ slots.account }}*/}</Suspense>
            ),
            /*{% endif %}*/
            /*{% if enabled.cart %}*/
            CartSlot: {/*{{ slots.cart }}*/},
            /*{% endif %}*/
            /*{% if enabled.businessUnit %}*/
            BusinessUnitSwitcher: (
              <Suspense fallback={null}>
                {/*{{ slots.businessUnit }}*/}
              </Suspense>
            ),
            /*{% endif %}*/
            /*{% if enabled.search %}*/
            Search: headerSearch,
            /*{% endif %}*/
          }}
        />
      }
    >
      {children}
    </CmsPageLayout>
  );
}

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  return (
    <DocumentShell lang={locale}>
      <NextIntlClientProvider>
        {/*{{ slots.commerce.open }}*/}
        <PageShell>{children}</PageShell>
        <CmsLayoutIntegration />
        {/*{{ slots.commerce.close }}*/}
      </NextIntlClientProvider>
    </DocumentShell>
  );
}
