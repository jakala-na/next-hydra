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
import {
  AnonymousCommercePrincipal,
  AuthUserId,
  CustomerCommercePrincipal,
} from "../../domain/commerce-request-context";
import { CommerceLocale, Store, StoreKey } from "../../store";
import { toCheckoutScope } from "./request-context";

const store = new Store({
  currency: "USD",
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("default-store"),
});

describe(toCheckoutScope, () => {
  it("derives anonymous checkout scope from anonymous cart possession", () => {
    const context = {
      principal: new AnonymousCommercePrincipal({
        anonymousCartId: CartId.make("cart-1"),
      }),
      store,
    };

    const scope = toCheckoutScope(context);

    expect(scope).toBeInstanceOf(StorefrontAnonymousCheckoutScope);
    expect(scope).toMatchObject({
      anonymousCartId: "cart-1",
      channel: "storefrontAnonymous",
      locale: "en-US",
    });
  });

  it("derives anonymous checkout scope without treating Cart absence as missing context", () => {
    const context = {
      principal: new AnonymousCommercePrincipal({}),
      store,
    };

    const scope = toCheckoutScope(context);

    expect(scope).toBeInstanceOf(StorefrontAnonymousCheckoutScope);
    expect(scope).toEqual(
      new StorefrontAnonymousCheckoutScope({
        channel: "storefrontAnonymous",
        locale: CommerceLocale.make("en-US"),
      })
    );
  });

  it("derives customer checkout scope from verified customer principal", () => {
    const context = {
      principal: new CustomerCommercePrincipal({
        authUserId: AuthUserId.make("auth-user-1"),
        businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
        businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
        customerId: CommerceCustomerId.make("customer-1"),
        roles: ["admin", "buyer"],
      }),
      store,
    };

    const scope = toCheckoutScope(context);

    expect(scope).toBeInstanceOf(StorefrontCustomerCheckoutScope);
    expect(scope).toMatchObject({
      businessUnitId: "business-unit-1",
      businessUnitKey: "business-unit-key-1",
      channel: "storefrontCustomer",
      customerId: "customer-1",
      locale: "en-US",
    });
  });
});
