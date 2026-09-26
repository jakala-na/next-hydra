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
  PlaceCheckoutOrderAction,
} from "./action-contract";
import { CheckoutView } from "./checkout-view";
import type {
  CheckoutPaymentOptionsRenderer,
  CheckoutPlaceOrderRenderer,
} from "./checkout-view";
import type { CheckoutEditStepId } from "./edit-step";
import { checkoutEditedStepFor, checkoutRenderedStepFor } from "./edit-step";

export async function CheckoutPage({
  actions,
  checkoutPath,
  locale,
  requestedEditStep,
  renderPaymentOptions,
  renderPlaceOrder,
}: {
  readonly actions: {
    readonly saveContact: SaveCheckoutContactAction;
    readonly saveDeliveryDetails: SaveCheckoutDeliveryDetailsAction;
    readonly savePaymentOptions: SaveCheckoutPaymentOptionsAction;
    readonly saveShippingOptions: SaveCheckoutShippingOptionsAction;
    readonly placeOrder: PlaceCheckoutOrderAction;
  };
  readonly checkoutPath: string;
  readonly locale: Locale;
  readonly requestedEditStep?: CheckoutEditStepId;
  readonly renderPaymentOptions: CheckoutPaymentOptionsRenderer;
  readonly renderPlaceOrder: CheckoutPlaceOrderRenderer;
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
      const editedStep = checkoutEditedStepFor(
        snapshot.state,
        requestedEditStep
      );
      const renderedStep = checkoutRenderedStepFor(snapshot.state, editedStep);
      const paymentSnapshot =
        renderedStep === "paymentOptions"
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
  const editedStep = checkoutEditedStepFor(
    pageData.snapshot.state,
    requestedEditStep
  );

  return (
    <CheckoutView
      actions={{
        placeOrder: actions.placeOrder,
        saveContact: actions.saveContact,
        saveDeliveryDetails: actions.saveDeliveryDetails,
        savePaymentOptions: actions.savePaymentOptions,
        saveShippingOptions: actions.saveShippingOptions,
      }}
      checkoutPath={checkoutPath}
      deliveryPlanQuote={pageData.snapshot.deliveryPlanQuote}
      editedStep={editedStep}
      locale={locale}
      paymentOptions={pageData.paymentOptions}
      renderPaymentOptions={renderPaymentOptions}
      renderPlaceOrder={renderPlaceOrder}
      shippingAddressOptions={pageData.shippingAddressOptions}
      state={pageData.snapshot.state}
    />
  );
}
