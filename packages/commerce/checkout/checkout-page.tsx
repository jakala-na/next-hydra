import "server-only";
import { NextCommerce } from "@repo/commerce/runtime";
import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { CheckoutSession } from "../lib/checkout/checkout-session";
import { AddressBook } from "../services/address-book";
import type {
  SaveCheckoutContactAction,
  SaveCheckoutDeliveryDetailsAction,
  SaveCheckoutPaymentOptionsAction,
  SaveCheckoutShippingOptionsAction,
} from "./action-contract";
import { CheckoutView } from "./checkout-view";
import type { CheckoutPaymentOptionsRenderer } from "./checkout-view";

export async function CheckoutPage({
  actions,
  locale,
  renderPaymentOptions,
}: {
  readonly actions: {
    readonly saveContact: SaveCheckoutContactAction;
    readonly saveDeliveryDetails: SaveCheckoutDeliveryDetailsAction;
    readonly savePaymentOptions: SaveCheckoutPaymentOptionsAction;
    readonly saveShippingOptions: SaveCheckoutShippingOptionsAction;
  };
  readonly locale: Locale;
  readonly renderPaymentOptions: CheckoutPaymentOptionsRenderer;
}) {
  await connection();

  const pageData = await NextCommerce.runPromise(
    Effect.gen(function* () {
      const snapshot =
        yield* CheckoutSession.getCurrentWithDeliveryPlans().pipe(
          Effect.catchTag("CheckoutUnavailable", () => Effect.succeed(null))
        );
      if (snapshot === null) {
        return {
          paymentOptions: undefined,
          shippingAddressOptions: undefined,
          snapshot,
        };
      }
      const paymentSnapshot =
        snapshot.state.activeStep === "paymentOptions"
          ? yield* CheckoutSession.preparePaymentOptions()
          : undefined;
      const currentSnapshot = paymentSnapshot ?? snapshot;
      const { state } = currentSnapshot;
      const entries =
        state.scope.channel === "storefrontCustomer"
          ? yield* AddressBook.list().pipe(
              Effect.map((addressBookEntries) =>
                addressBookEntries.filter((entry) =>
                  entry.types.includes("shipping")
                )
              )
            )
          : undefined;
      return {
        paymentOptions: paymentSnapshot?.paymentOptions,
        shippingAddressOptions: entries?.map((entry) => ({
          address: { ...entry.address },
          defaultShipping: entry.defaultShipping,
          reference: entry.reference,
        })),
        snapshot: currentSnapshot,
      };
    }).pipe(
      NextCommerce.provide(locale),
      Effect.catchTag("CommerceRequestContextNotFound", () =>
        Effect.succeed(null)
      )
    )
  );

  if (pageData === null) {
    notFound();
  }
  if (pageData.snapshot === null) {
    notFound();
  }

  return (
    <CheckoutView
      actions={{
        saveContact: actions.saveContact,
        saveDeliveryDetails: actions.saveDeliveryDetails,
        savePaymentOptions: actions.savePaymentOptions,
        saveShippingOptions: actions.saveShippingOptions,
      }}
      deliveryPlanQuote={pageData.snapshot.deliveryPlanQuote}
      locale={locale}
      paymentOptions={pageData.paymentOptions}
      renderPaymentOptions={renderPaymentOptions}
      shippingAddressOptions={pageData.shippingAddressOptions}
      state={pageData.snapshot.state}
    />
  );
}
