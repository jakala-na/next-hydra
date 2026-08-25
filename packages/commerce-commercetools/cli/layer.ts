import { ConfigProvider, Layer } from "effect";
import type { Effect } from "effect";

import { restClientLayer } from "../client/rest-client-live";
import { CommercetoolsConfig } from "../config/config";
import { projectAdministrationLayer } from "./project-provisioning/administration-live";
import { BootstrapCommercetoolsConfig } from "./project-provisioning/bootstrap-config";
import { runtimeCredentialHandoffLayer } from "./project-provisioning/credential-handoff-live";
import { RuntimeProjectSetup } from "./project-provisioning/runtime-project-setup";

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

export const createProjectProvisioningCliLayer = <E, R>(
  configProvider: Effect.Effect<ConfigProvider.ConfigProvider, E, R>
) => {
  const bootstrapConfigLayer = BootstrapCommercetoolsConfig.layer.pipe(
    Layer.provide(ConfigProvider.layer(configProvider))
  );
  const administrationLayer = projectAdministrationLayer.pipe(
    Layer.provideMerge(bootstrapConfigLayer)
  );

  return Layer.mergeAll(
    administrationLayer,
    RuntimeProjectSetup.layerLive,
    runtimeCredentialHandoffLayer
  );
};
