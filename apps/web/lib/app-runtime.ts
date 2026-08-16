import "server-only";
import {
  addressBookLayer,
  cartsLayer,
  commerceAccountsLayer,
  productDiscoveryLayer,
} from "@repo/commerce-provider/provider";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { sentryEffectTelemetryLayer } from "@repo/observability/effect";
import { Layer, ManagedRuntime } from "effect";

import { currentAuthLayer } from "./current-auth";
import { nextRequestApiLayer } from "./next-request";
import { nextServerLayer } from "./next-server";

export const CommerceApp = makeCommerceApp({
  addressBookLayer: Layer.orDie(addressBookLayer),
  cartPoliciesLayer: CartPolicies.layer,
  cartsLayer: Layer.orDie(cartsLayer),
  checkoutPoliciesLayer: CheckoutPolicies.layer,
  commerceAccountsLayer: Layer.orDie(commerceAccountsLayer),
  productDiscoveryLayer: Layer.orDie(productDiscoveryLayer),
});

export const appLayer = Layer.mergeAll(
  CommerceApp.layer,
  currentAuthLayer,
  nextRequestApiLayer,
  nextServerLayer,
  sentryEffectTelemetryLayer
);

export const AppRuntime = ManagedRuntime.make(appLayer);
