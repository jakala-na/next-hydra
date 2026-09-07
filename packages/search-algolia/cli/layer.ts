import { runtimeEnvironmentPublisherLayer } from "@repo/cli-core/runtime-environment";
import { ConfigProvider, Layer } from "effect";
import type { Effect } from "effect";

import { algoliaAdministrationLayer } from "./provisioning/administration-live";
import { AlgoliaProvisioningConfig } from "./provisioning/config";

export const createSearchProvisioningLayer = <E, R>(
  configProvider: Effect.Effect<ConfigProvider.ConfigProvider, E, R>
) => {
  const configLayer = AlgoliaProvisioningConfig.layer.pipe(
    Layer.provide(ConfigProvider.layer(configProvider))
  );
  const administrationLayer = algoliaAdministrationLayer.pipe(
    Layer.provide(configLayer)
  );

  return Layer.mergeAll(
    configLayer,
    administrationLayer,
    runtimeEnvironmentPublisherLayer
  );
};
