import {
  addressBookLayer,
  cartsLayer,
  commercetoolsClientsLayer,
  commerceAccountsLayer,
  commerceCompanyMembershipsLayer,
  deliveryPlanningLayer,
  productDiscoveryLayer,
} from "@repo/commerce-provider/provider";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { Layer } from "effect";

export const commerceApp = makeCommerceApp({
  addressBookLayer,
  cartPoliciesLayer: CartPolicies.layer,
  cartsLayer: cartsLayer.pipe(Layer.provide(commercetoolsClientsLayer)),
  checkoutPoliciesLayer: CheckoutPolicies.layer,
  commerceAccountsLayer,
  commerceCompanyMembershipsLayer,
  deliveryPlanningLayer: deliveryPlanningLayer.pipe(
    Layer.provide(commercetoolsClientsLayer)
  ),
  productDiscoveryLayer,
});
