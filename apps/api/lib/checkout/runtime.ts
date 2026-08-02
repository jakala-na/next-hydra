import { layerWorkosAccessTokenVerifier } from "@repo/auth-workos/access-token";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { layerCommercetoolsAddressBook } from "@repo/commerce/lib/infra/commercetools/address-book";
import { layerCommercetoolsCarts } from "@repo/commerce/lib/infra/commercetools/carts";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { Layer } from "effect";
import { checkoutCustomerJwtVerifierLayerWorkos } from "./customer-jwt-workos";

export const checkoutHttpDependencies = {
  addressBookLayer: layerCommercetoolsAddressBook,
  layer: Layer.mergeAll(
    layerCommercetoolsCarts,
    layerCommercetoolsCommerceAccounts,
    CartPolicies.layer,
    CheckoutPolicies.layer,
    checkoutCustomerJwtVerifierLayerWorkos.pipe(
      Layer.provide(layerWorkosAccessTokenVerifier())
    )
  ),
};
