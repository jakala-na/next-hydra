import { describe, expect, it } from "vitest";
import { CartId } from "../../domain/cart";
import {
  CheckoutLocale,
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "../../domain/checkout";
import { CommerceCustomerId } from "../../domain/commerce-account";
import {
  AnonymousCommercePrincipal,
  AuthUserId,
  CommerceRequestContext,
  CustomerCommercePrincipal,
} from "../../domain/commerce-request-context";
import { toCheckoutScope } from "./request-context";

describe("toCheckoutScope", () => {
  it("derives anonymous checkout scope from anonymous cart possession", () => {
    const context = new CommerceRequestContext({
      locale: CheckoutLocale.make("en-US"),
      principal: new AnonymousCommercePrincipal({
        anonymousCartId: CartId.make("cart-1"),
      }),
    });

    const scope = toCheckoutScope(context);

    expect(scope).toBeInstanceOf(StorefrontAnonymousCheckoutScope);
    expect(scope).toMatchObject({
      channel: "storefrontAnonymous",
      locale: "en-US",
      anonymousCartId: "cart-1",
    });
  });

  it("derives customer checkout scope from verified customer principal", () => {
    const context = new CommerceRequestContext({
      locale: CheckoutLocale.make("en-US"),
      principal: new CustomerCommercePrincipal({
        authUserId: AuthUserId.make("auth-user-1"),
        customerId: CommerceCustomerId.make("customer-1"),
      }),
    });

    const scope = toCheckoutScope(context);

    expect(scope).toBeInstanceOf(StorefrontCustomerCheckoutScope);
    expect(scope).toMatchObject({
      channel: "storefrontCustomer",
      locale: "en-US",
      customerId: "customer-1",
    });
  });
});
