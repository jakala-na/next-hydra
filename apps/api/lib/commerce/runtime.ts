import {
  addressBookLayer,
  cartsLayer,
  commercetoolsClientsLayer,
  commerceAccountsLayer,
  commerceCompanyMembershipsLayer,
  deliveryPlanningLayer,
  ordersLayer,
  productDiscoveryLayer,
} from "@repo/commerce-provider/provider";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { commercetoolsStripeCheckoutPaymentsLayer } from "@repo/payments-stripe/server/commercetools";
import { Layer } from "effect";

const checkoutPaymentsLayer = Layer.orDie(
  commercetoolsStripeCheckoutPaymentsLayer
);

export const commerceApp = makeCommerceApp({
  addressBookLayer,
  cartPoliciesLayer: CartPolicies.layer,
  cartsLayer: cartsLayer.pipe(Layer.provide(commercetoolsClientsLayer)),
  checkoutPaymentsLayer,
  checkoutPoliciesLayer: CheckoutPolicies.layer,
  commerceAccountsLayer,
  commerceCompanyMembershipsLayer,
  deliveryPlanningLayer: deliveryPlanningLayer.pipe(
    Layer.provide(commercetoolsClientsLayer)
  ),
  ordersLayer: ordersLayer.pipe(Layer.provide(commercetoolsClientsLayer)),
  productDiscoveryLayer,
});
