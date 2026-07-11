import { describe, expect, it } from "vitest";
import { CartId } from "../../domain/cart";
import {
  CheckoutLocale,
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "../../domain/checkout";
import { CommerceCustomerId } from "../../domain/commerce-account";
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
        })
      )
    ).toEqual(["customerProfile"]);
  });
});
