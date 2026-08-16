import { CheckoutPage } from "@repo/commerce/checkout";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { notFound } from "next/navigation";

import {
  saveCheckoutContact,
  saveCheckoutDeliveryDetails,
} from "@/lib/commerce-actions";

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
  return (
    <CheckoutPage
      actions={{
        saveContact: saveCheckoutContact,
        saveDeliveryDetails: saveCheckoutDeliveryDetails,
      }}
      locale={locale}
    />
  );
}
