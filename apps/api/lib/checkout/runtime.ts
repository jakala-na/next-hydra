import { layerWorkosAccessTokenVerifier } from "@repo/auth/access-token";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import {
  addressBookLayer,
  cartsLayer,
  commerceAccountsLayer,
  productDiscoveryLayer,
} from "@repo/commerce-provider/provider";
import { Layer } from "effect";
import { checkoutCustomerJwtVerifierLayerWorkos } from "./customer-jwt-workos";
import { makeCheckoutHttpHandler } from "./http";

const CommerceApp = makeCommerceApp({
  addressBookLayer,
  cartPoliciesLayer: CartPolicies.layer,
  cartsLayer,
  checkoutPoliciesLayer: CheckoutPolicies.layer,
  commerceAccountsLayer,
  productDiscoveryLayer,
});

const checkoutHttpDependencies = {
  authenticationLayer: checkoutCustomerJwtVerifierLayerWorkos.pipe(
    Layer.provide(layerWorkosAccessTokenVerifier())
  ),
  commerceApp: CommerceApp,
};

const checkoutHttp = makeCheckoutHttpHandler(checkoutHttpDependencies);

export const checkoutHttpHandler = checkoutHttp.handler;
