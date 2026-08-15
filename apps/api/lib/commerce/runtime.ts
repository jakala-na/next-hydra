import {
  addressBookLayer,
  cartsLayer,
  commerceAccountsLayer,
  productDiscoveryLayer,
} from "@repo/commerce-provider/provider";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import { CartPolicies } from "@repo/commerce/services/cart-policies";

export const commerceApp = makeCommerceApp({
  addressBookLayer,
  cartPoliciesLayer: CartPolicies.layer,
  cartsLayer,
  checkoutPoliciesLayer: CheckoutPolicies.layer,
  commerceAccountsLayer,
  productDiscoveryLayer,
});
