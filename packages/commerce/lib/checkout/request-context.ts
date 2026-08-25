import {
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "../../domain/checkout";
import type { CheckoutScope } from "../../domain/checkout";
import {
  AnonymousCommercePrincipal,
  CustomerCommercePrincipal,
} from "../../domain/commerce-request-context";
import type { CommercePrincipal } from "../../domain/commerce-request-context";
import type { Store } from "../../store";

type CheckoutCommerceContext = {
  readonly store: Store;
  readonly principal: CommercePrincipal;
};

export const toCheckoutScope = (
  context: CheckoutCommerceContext
): CheckoutScope => {
  const { principal, store } = context;
  const { locale } = store;

  if (principal instanceof AnonymousCommercePrincipal) {
    return new StorefrontAnonymousCheckoutScope({
      anonymousCartId: principal.anonymousCartId,
      channel: "storefrontAnonymous",
      locale,
    });
  }

  if (principal instanceof CustomerCommercePrincipal) {
    return new StorefrontCustomerCheckoutScope({
      businessUnitId: principal.businessUnitId,
      businessUnitKey: principal.businessUnitKey,
      channel: "storefrontCustomer",
      customerId: principal.customerId,
      locale,
    });
  }

  principal satisfies never;
  throw new Error("Unsupported Commerce Principal");
};
