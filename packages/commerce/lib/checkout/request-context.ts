import type { CartStore } from "../../domain/cart-snapshot";
import {
  type CheckoutScope,
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "../../domain/checkout";
import {
  AnonymousCommercePrincipal,
  type CommercePrincipal,
  CustomerCommercePrincipal,
} from "../../domain/commerce-request-context";

type CheckoutCommerceContext = {
  readonly store: CartStore;
  readonly principal: CommercePrincipal;
};

export const toCheckoutScope = (
  context: CheckoutCommerceContext
): CheckoutScope => {
  const { principal, store } = context;
  const { locale } = store;

  if (principal instanceof AnonymousCommercePrincipal) {
    return new StorefrontAnonymousCheckoutScope({
      channel: "storefrontAnonymous",
      locale,
      anonymousCartId: principal.anonymousCartId,
    });
  }

  if (principal instanceof CustomerCommercePrincipal) {
    return new StorefrontCustomerCheckoutScope({
      channel: "storefrontCustomer",
      locale,
      customerId: principal.customerId,
      businessUnitId: principal.businessUnitId,
      businessUnitKey: principal.businessUnitKey,
    });
  }

  principal satisfies never;
  throw new Error("Unsupported Commerce Principal");
};
