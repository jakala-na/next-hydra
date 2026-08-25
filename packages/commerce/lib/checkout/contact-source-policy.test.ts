import { describe, expect, it } from "vitest";

import { CartId } from "../../domain/cart";
import {
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "../../domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../../domain/commerce-account";
import { CommerceLocale } from "../../store";
import { allowedContactSourcesForCheckout } from "./contact-source-policy";

describe(allowedContactSourcesForCheckout, () => {
  it("allows Manual Contact for anonymous storefront checkout", () => {
    expect(
      allowedContactSourcesForCheckout(
        new StorefrontAnonymousCheckoutScope({
          anonymousCartId: CartId.make("cart-1"),
          channel: "storefrontAnonymous",
          locale: CommerceLocale.make("en-US"),
        })
      )
    ).toStrictEqual(["manual"]);
  });

  it("allows Customer Profile and Manual Contact for customer checkout", () => {
    expect(
      allowedContactSourcesForCheckout(
        new StorefrontCustomerCheckoutScope({
          businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
          businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
          channel: "storefrontCustomer",
          customerId: CommerceCustomerId.make("customer-1"),
          locale: CommerceLocale.make("en-US"),
        })
      )
    ).toStrictEqual(["customerProfile", "manual"]);
  });
});
