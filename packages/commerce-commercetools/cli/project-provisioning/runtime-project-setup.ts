import { Context, Effect, Layer } from "effect";

import { restClientLayerFrom } from "../../client/rest-client-live";
import type {
  ProjectSeedReceipt,
  RuntimeCredentials,
  RuntimeProjectSetupError,
} from "./model";
import { seedCommerceProject } from "./seed";

interface RuntimeProjectSetupValue {
  readonly setup: (
    credentials: RuntimeCredentials
  ) => Effect.Effect<ProjectSeedReceipt, RuntimeProjectSetupError>;
}

export class RuntimeProjectSetup extends Context.Service<
  RuntimeProjectSetup,
  RuntimeProjectSetupValue
>()("@repo/commerce-commercetools/RuntimeProjectSetup") {
  static readonly layerFrom = (value: RuntimeProjectSetupValue) =>
    Layer.succeed(RuntimeProjectSetup, RuntimeProjectSetup.of(value));

  static readonly layerLive = Layer.succeed(
    RuntimeProjectSetup,
    RuntimeProjectSetup.of({
      setup: (credentials) =>
        seedCommerceProject().pipe(
          Effect.provide(restClientLayerFrom(credentials))
        ),
    })
  );
}
