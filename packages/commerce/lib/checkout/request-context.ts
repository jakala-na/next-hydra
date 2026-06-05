import {
  type CheckoutScope,
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "../../domain/checkout";
import {
  AnonymousCommercePrincipal,
  type CommerceRequestContext,
  CustomerCommercePrincipal,
} from "../../domain/commerce-request-context";

export const toCheckoutScope = (
  context: CommerceRequestContext
): CheckoutScope => {
  const { locale, principal } = context;

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
    });
  }

  principal satisfies never;
  throw new Error("Unsupported Commerce Principal");
};
