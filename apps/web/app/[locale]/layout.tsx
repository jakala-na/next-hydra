import "./styles.css";
import { CmsLayoutIntegration } from "@repo/cms/layout";
import { CommerceCartProvider } from "@repo/commerce/cart";
import { hasLocale, NextIntlClientProvider } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { notFound } from "next/navigation";

import { DocumentShell } from "@/components/layout/document-shell";
import PageShell from "@/components/layout/page-shell";
import {
  addToCart,
  changeCartItemsQuantity,
  removeCartItem,
} from "@/lib/commerce-actions";

export const instant = false;
export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }));

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {notFound();}
  return (
    <DocumentShell lang={locale}>
      <NextIntlClientProvider>
        <CommerceCartProvider
          actions={{ addToCart, changeCartItemsQuantity, removeCartItem }}
          locale={locale}
        >
          <PageShell>{children}</PageShell>
          <CmsLayoutIntegration />
        </CommerceCartProvider>
      </NextIntlClientProvider>
    </DocumentShell>
  );
}
