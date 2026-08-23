import { Layer } from "effect";
import type { ConfigProvider, Effect } from "effect";

import { contentstackCliLayer } from "./provisioning/contentstack-cli-live";
import { contentstackRecipeLayer } from "./provisioning/recipe-live";
import {
  contentstackRuntimeCredentialHandoffLayer,
  createContentstackRuntimeCredentialInputLayer,
} from "./provisioning/runtime-credentials-live";

export const createContentstackProvisioningLayer = <E, R>(
  configProvider: Effect.Effect<ConfigProvider.ConfigProvider, E, R>
) =>
  Layer.mergeAll(
    contentstackCliLayer,
    contentstackRecipeLayer,
    createContentstackRuntimeCredentialInputLayer(configProvider),
    contentstackRuntimeCredentialHandoffLayer
  );
