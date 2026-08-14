import "server-only";

import { NextCommerce } from "@repo/commerce/runtime";
import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";
import { notFound } from "next/navigation";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import { AddressBook } from "../services/address-book";
import { saveCheckoutContact, saveCheckoutDeliveryDetails } from "./actions";
import { CheckoutView } from "./checkout-view";

export async function CheckoutPage({ locale }: { readonly locale: Locale }) {
  const pageData = await NextCommerce.runPromise(
    Effect.gen(function* () {
      const state = yield* CheckoutSession.getCurrent().pipe(
        Effect.catchTag("CheckoutUnavailable", () => Effect.succeed(null))
      );
      if (state === null) {
        return { shippingAddressOptions: undefined, state };
      }
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
        shippingAddressOptions: entries?.map((entry) => ({
          address: { ...entry.address },
          defaultShipping: entry.defaultShipping,
          reference: entry.reference,
        })),
        state,
      };
    }).pipe(
      NextCommerce.provide(locale),
      Effect.catchTag("CommerceRequestContextNotFound", () =>
        Effect.succeed(null)
      )
    )
  );

  if (pageData === null || pageData.state === null) {
    notFound();
  }

  return (
    <CheckoutView
      actions={{
        saveContact: saveCheckoutContact,
        saveDeliveryDetails: saveCheckoutDeliveryDetails,
      }}
      locale={locale}
      shippingAddressOptions={pageData.shippingAddressOptions}
      state={pageData.state}
    />
  );
}
