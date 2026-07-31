import { describe, expect, it } from "vitest";
import { CartId } from "../../domain/cart";
import {
  CheckoutLocale,
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "../../domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../../domain/commerce-account";
import { allowedContactSourcesForCheckout } from "./contact-source-policy";

describe("allowedContactSourcesForCheckout", () => {
  it("allows Manual Contact for anonymous storefront checkout", () => {
    expect(
      allowedContactSourcesForCheckout(
        new StorefrontAnonymousCheckoutScope({
          channel: "storefrontAnonymous",
          locale: CheckoutLocale.make("en-US"),
          anonymousCartId: CartId.make("cart-1"),
        })
      )
    ).toEqual(["manual"]);
  });

  it("disallows Manual Contact for customer storefront checkout", () => {
    expect(
      allowedContactSourcesForCheckout(
        new StorefrontCustomerCheckoutScope({
          channel: "storefrontCustomer",
          locale: CheckoutLocale.make("en-US"),
          customerId: CommerceCustomerId.make("customer-1"),
          businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
          businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
        })
      )
    ).toEqual(["customerProfile"]);
  });
});
