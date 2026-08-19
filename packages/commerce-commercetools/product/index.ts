import { Layer } from "effect";

import { commercetoolsClientsLayer } from "../client/layers";
import { commercetoolsProductDiscoveryClientLayer } from "./client-live";
import { productDiscoveryLayerWithClient } from "./product-discovery";

export const productDiscoveryLayer = productDiscoveryLayerWithClient(
  commercetoolsProductDiscoveryClientLayer.pipe(
    Layer.provide(commercetoolsClientsLayer)
  )
);
