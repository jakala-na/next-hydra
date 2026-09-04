import "@/app/[locale]/styles.css";

import {
  CmsGlobalRegion,
  CmsLayoutIntegration,
  getNavigation,
} from "@repo/cms/layout";
import { MobileMenu } from "@repo/design-system/components/layout/mobile-menu";
import { Navigation } from "@repo/design-system/components/layout/navigation";
import { RegionSelector } from "@repo/design-system/components/layout/region-selector";
import { SiteFooter } from "@repo/design-system/components/layout/site-footer";
import { SiteHeader } from "@repo/design-system/components/layout/site-header";
import { hasLocale, NextIntlClientProvider } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DocumentShell } from "@/components/layout/document-shell";

export const instant = false;

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

  const navigation = await getNavigation(locale);

  return (
    <DocumentShell lang={locale}>
      <NextIntlClientProvider>
        <CmsGlobalRegion locale={locale} name="pre-header" />
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
            <MobileMenu navigationItems={navigation.navigationItems} />
          }
        />
        <CmsGlobalRegion locale={locale} name="post-header" />
        {children}
        <CmsGlobalRegion locale={locale} name="pre-footer" />
        <SiteFooter />
        <CmsGlobalRegion locale={locale} name="post-footer" />
        <CmsLayoutIntegration />
      </NextIntlClientProvider>
    </DocumentShell>
  );
}
