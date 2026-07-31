import { layerWorkosAccessTokenVerifier } from "@repo/auth-workos/access-token";
import { checkoutRuntimeLayerCommercetools } from "@repo/commerce/lib/checkout/commercetools";
import { Layer } from "effect";
import { checkoutCustomerJwtVerifierLayerWorkos } from "./customer-jwt-workos";

export const checkoutLayer = Layer.mergeAll(
  checkoutRuntimeLayerCommercetools,
  checkoutCustomerJwtVerifierLayerWorkos.pipe(
    Layer.provide(layerWorkosAccessTokenVerifier())
  )
);
