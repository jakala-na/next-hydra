import { ConfigProvider, Layer } from "effect";
import type { Effect } from "effect";

import { restClientLayer } from "../client/rest-client-live";
import { CommercetoolsConfig } from "../config/config";

export const createCommerceCliLayer = <E, R>(
  configProvider: Effect.Effect<ConfigProvider.ConfigProvider, E, R>
) =>
  restClientLayer.pipe(
    Layer.provide(
      CommercetoolsConfig.layer.pipe(
        Layer.provide(ConfigProvider.layer(configProvider))
      )
    )
  );
