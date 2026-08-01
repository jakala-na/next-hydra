import { CheckoutPage } from "@repo/commerce/components/pages/checkout";
import type { AddressBookEntry } from "@repo/commerce/domain/address-book";
import { CustomerCommercePrincipal } from "@repo/commerce/domain/commerce-request-context";
import { CheckoutSession } from "@repo/commerce/lib/checkout/checkout-session";
import { toCheckoutScope } from "@repo/commerce/lib/checkout/request-context";
import { AddressBook } from "@repo/commerce/services/address-book";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { Effect } from "effect";
import { notFound } from "next/navigation";
import { runCheckoutReadWithContext } from "../../../lib/current-cart";
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
  const pageData = await runCheckoutReadWithContext(
    locale,
    async (context, run) => {
      if (context === null) {
        return { state: null, shippingAddressOptions: undefined };
      }
      return run(
        Effect.gen(function* () {
          const state = yield* CheckoutSession.getCurrent(
            toCheckoutScope(context)
          ).pipe(
            Effect.catchTag("CheckoutUnavailable", () => Effect.succeed(null))
          );
          if (
            state === null ||
            !(context.principal instanceof CustomerCommercePrincipal)
          ) {
            return { state, shippingAddressOptions: undefined };
          }
          const addressBook = yield* AddressBook;
          const entries = yield* addressBook.list(context.principal);
          return {
            state,
            shippingAddressOptions: entries
              .filter((entry) => entry.types.includes("shipping"))
              .map((entry: AddressBookEntry) => ({
                reference: entry.reference,
                address: { ...entry.address },
                defaultShipping: entry.defaultShipping,
              })),
          };
        })
      );
    }
  );

  if (pageData.state === null) {
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
