import { CheckoutPage } from "@repo/commerce/components/pages/checkout";
import { CheckoutSession } from "@repo/commerce/lib/checkout/checkout-session";
import { AddressBook } from "@repo/commerce/services/address-book";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { Effect } from "effect";
import { notFound } from "next/navigation";
import { nextCheckoutLayer } from "../../../lib/current-cart";
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
  const pageData = await Effect.runPromise(
    Effect.gen(function* () {
      const state = yield* CheckoutSession.getCurrent().pipe(
        Effect.catchTag("CheckoutUnavailable", () => Effect.succeed(null))
      );
      if (state === null) {
        return { state, shippingAddressOptions: undefined };
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
        state,
        shippingAddressOptions: entries?.map((entry) => ({
          reference: entry.reference,
          address: { ...entry.address },
          defaultShipping: entry.defaultShipping,
        })),
      };
    }).pipe(
      Effect.provide(nextCheckoutLayer(locale)),
      Effect.catchTag("CommerceRequestContextNotFound", () =>
        Effect.succeed(null)
      )
    )
  );

  if (pageData === null || pageData.state === null) {
    notFound();
  }

  return (
    <CheckoutPage
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
