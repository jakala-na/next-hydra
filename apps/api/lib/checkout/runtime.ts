import { layerWorkosAccessTokenVerifier } from "@repo/auth-workos/access-token";
import { checkoutRuntimeLayerCommercetools } from "@repo/commerce/lib/checkout/commercetools";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { Layer } from "effect";
import { checkoutCustomerJwtVerifierLayerWorkos } from "./customer-jwt-workos";

export const checkoutLayer = Layer.mergeAll(
  checkoutRuntimeLayerCommercetools,
  layerCommercetoolsCommerceAccounts,
  checkoutCustomerJwtVerifierLayerWorkos.pipe(
    Layer.provide(layerWorkosAccessTokenVerifier())
  )
);
