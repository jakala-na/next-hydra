import { layerWorkosAccessTokenVerifier } from "@repo/auth-workos/access-token";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { addressBookLayer } from "@repo/commerce-commercetools/address-book";
import { cartsLayer } from "@repo/commerce-commercetools/cart";
import { commerceAccountsLayer } from "@repo/commerce-commercetools/commerce-accounts";
import { Layer } from "effect";
import { checkoutCustomerJwtVerifierLayerWorkos } from "./customer-jwt-workos";

export const checkoutHttpDependencies = {
  addressBookLayer,
  layer: Layer.mergeAll(
    cartsLayer,
    commerceAccountsLayer,
    CartPolicies.layer,
    CheckoutPolicies.layer,
    checkoutCustomerJwtVerifierLayerWorkos.pipe(
      Layer.provide(layerWorkosAccessTokenVerifier())
    )
  ),
};
