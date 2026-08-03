import { commercetoolsProductDiscoveryClientLayer } from "./client-live";
import { productDiscoveryLayerWithClient } from "./product-discovery";

export const productDiscoveryLayer = productDiscoveryLayerWithClient(
  commercetoolsProductDiscoveryClientLayer
);
