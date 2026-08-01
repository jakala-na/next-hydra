import { CheckoutPage } from "@repo/commerce/components/pages/checkout";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { Effect } from "effect";
import { notFound } from "next/navigation";
import { resolveCheckoutContext } from "../../../lib/checkout-scope";
import { saveCheckoutContact, saveCheckoutDeliveryDetails } from "./actions";

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
  const context = await Effect.runPromise(
    resolveCheckoutContext(locale).pipe(
      Effect.catchTag("CommerceRequestContextNotFound", () =>
        Effect.succeed(null)
      ),
      Effect.provide(layerCommercetoolsCommerceAccounts)
    )
  );

  if (context === null) {
    notFound();
  }

  return (
    <CheckoutPage
      actions={{
        saveContact: saveCheckoutContact,
        saveDeliveryDetails: saveCheckoutDeliveryDetails,
      }}
      context={context}
      locale={locale}
    />
  );
}
