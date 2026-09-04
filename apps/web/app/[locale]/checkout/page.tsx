import { CheckoutEditStepId, CheckoutPage } from "@repo/commerce/checkout";
import type { CheckoutPaymentOptionsRenderer } from "@repo/commerce/checkout";
import { recoverOrderConfirmation } from "@repo/commerce/lib/order/order-confirmation";
import {
  ORDER_PLACEMENT_RECOVERY_COOKIE_NAME,
  decodeOrderPlacementRecoveryCookie,
} from "@repo/commerce/lib/order/utils/order-placement-recovery-cookie";
import { NextCommerce } from "@repo/commerce/runtime";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import {
  CheckoutStripePaymentOptionsForm,
  CheckoutStripePlaceOrderForm,
} from "@repo/payments-stripe/checkout";
import { Effect, Option, Schema } from "effect";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import {
  saveCheckoutContact,
  placeCheckoutOrder,
  saveCheckoutDeliveryDetails,
  saveCheckoutPaymentOptions,
  saveCheckoutShippingOptions,
} from "@/lib/commerce-actions";

type CheckoutRouteProps = {
  readonly params: Promise<{
    readonly locale: string;
  }>;
  readonly searchParams: Promise<{
    readonly edit?: string | readonly string[];
  }>;
};

const renderPaymentOptions: CheckoutPaymentOptionsRenderer = (props) => (
  <CheckoutStripePaymentOptionsForm {...props} />
);

const renderPlaceOrder = (
  props: Parameters<typeof CheckoutStripePlaceOrderForm>[0]
) => <CheckoutStripePlaceOrderForm {...props} />;

export default async function Checkout({
  params,
  searchParams,
}: CheckoutRouteProps) {
  const [{ locale }, { edit }] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // oxlint-disable-next-line typescript/no-deprecated -- The app-wide next/root-params migration is outside this Checkout composition slice.
  setRequestLocale(locale);
  const requestedEditStep = Schema.decodeUnknownOption(CheckoutEditStepId)(
    edit
  ).pipe(Option.getOrUndefined);
  const checkoutPath = `/${locale}/checkout`;
  const cookieStore = await cookies();
  const recovery = decodeOrderPlacementRecoveryCookie(
    cookieStore.get(ORDER_PLACEMENT_RECOVERY_COOKIE_NAME)?.value
  );
  if (recovery !== undefined) {
    const confirmation = await NextCommerce.runPromise(
      recoverOrderConfirmation(recovery.cartId).pipe(
        NextCommerce.provide(locale),
        Effect.catchTag("CommerceRequestContextNotFound", () =>
          Effect.succeed(Option.none())
        )
      )
    );
    if (Option.isSome(confirmation)) {
      redirect(
        `/${locale}/checkout/orders/${encodeURIComponent(confirmation.value.order.id)}`
      );
    }
  }
  return (
    <Suspense
      fallback={
        <main aria-busy="true" className="container mx-auto max-w-5xl p-6">
          Loading checkout…
        </main>
      }
    >
      <CheckoutPage
        actions={{
          placeOrder: placeCheckoutOrder,
          saveContact: saveCheckoutContact,
          saveDeliveryDetails: saveCheckoutDeliveryDetails,
          savePaymentOptions: saveCheckoutPaymentOptions,
          saveShippingOptions: saveCheckoutShippingOptions,
        }}
        checkoutPath={checkoutPath}
        locale={locale}
        requestedEditStep={requestedEditStep}
        renderPaymentOptions={renderPaymentOptions}
        renderPlaceOrder={renderPlaceOrder}
      />
    </Suspense>
  );
}
