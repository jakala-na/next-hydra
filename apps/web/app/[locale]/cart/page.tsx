import { CartPage } from "@repo/commerce/cart";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { notFound } from "next/navigation";
import { Suspense } from "react";

type CartRouteProps = {
  readonly params: Promise<{
    readonly locale: string;
  }>;
};

export default async function Cart({ params }: CartRouteProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // oxlint-disable-next-line typescript/no-deprecated -- The app-wide next/root-params migration is outside this Cart composition slice.
  setRequestLocale(locale);
  return (
    <Suspense
      fallback={
        <main aria-busy="true" className="container mx-auto max-w-7xl p-6">
          Loading cart…
        </main>
      }
    >
      <CartPage locale={locale} />
    </Suspense>
  );
}
