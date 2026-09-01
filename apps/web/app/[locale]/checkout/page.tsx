import { CheckoutPage } from "@repo/commerce/checkout";
import type { CheckoutPaymentOptionsRenderer } from "@repo/commerce/checkout";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { CheckoutStripePaymentOptionsForm } from "@repo/payments-stripe/checkout";
import { notFound } from "next/navigation";

import {
  saveCheckoutContact,
  saveCheckoutDeliveryDetails,
  saveCheckoutPaymentOptions,
  saveCheckoutShippingOptions,
} from "@/lib/commerce-actions";

type CheckoutRouteProps = {
  readonly params: Promise<{
    readonly locale: string;
  }>;
};

const renderPaymentOptions: CheckoutPaymentOptionsRenderer = (props) => (
  <CheckoutStripePaymentOptionsForm {...props} />
);

export default async function Checkout({ params }: CheckoutRouteProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // oxlint-disable-next-line typescript/no-deprecated -- The app-wide next/root-params migration is outside this Checkout composition slice.
  setRequestLocale(locale);
  return (
    <CheckoutPage
      actions={{
        saveContact: saveCheckoutContact,
        saveDeliveryDetails: saveCheckoutDeliveryDetails,
        savePaymentOptions: saveCheckoutPaymentOptions,
        saveShippingOptions: saveCheckoutShippingOptions,
      }}
      locale={locale}
      renderPaymentOptions={renderPaymentOptions}
    />
  );
}
