import { CheckoutPage } from "@repo/commerce/components/pages/checkout";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { notFound } from "next/navigation";

type CheckoutRouteProps = {
  readonly params: Promise<{
    readonly locale: string;
  }>;
};

export default async function Checkout({ params }: CheckoutRouteProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  return <CheckoutPage locale={locale} />;
}
