import "server-only";
import { Layer } from "effect";

import { CommercetoolsConfig } from "../config/config";
import { graphqlClientLayer } from "./graphql-client-live";
import { restClientLayer } from "./rest-client-live";

export const commercetoolsConfigLayer = CommercetoolsConfig.layer;

export const commercetoolsRestClientLayer = restClientLayer.pipe(
  Layer.provide(commercetoolsConfigLayer)
);

export const commercetoolsGraphqlClientLayer = graphqlClientLayer.pipe(
  Layer.provide(commercetoolsRestClientLayer)
);

export const commercetoolsClientsLayer = Layer.merge(
  commercetoolsRestClientLayer,
  commercetoolsGraphqlClientLayer
);
