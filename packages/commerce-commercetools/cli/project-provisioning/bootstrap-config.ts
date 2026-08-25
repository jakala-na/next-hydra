import type { Redacted } from "effect";
import { Config, Context, Effect, Layer } from "effect";

import { ApiClientId, CommercetoolsRegion, ProjectKey } from "./model";

interface BootstrapCommercetoolsConfigValue {
  readonly clientId: ApiClientId;
  readonly clientSecret: Redacted.Redacted;
  readonly projectKey: ProjectKey;
  readonly region: CommercetoolsRegion;
}

export class BootstrapCommercetoolsConfig extends Context.Service<
  BootstrapCommercetoolsConfig,
  BootstrapCommercetoolsConfigValue
>()("@repo/commerce-commercetools/BootstrapConfig") {
  static readonly layer = Layer.effect(
    BootstrapCommercetoolsConfig,
    Effect.gen(function* () {
      const projectKey = yield* Config.nonEmptyString(
        "COMMERCETOOLS_PROJECT_KEY"
      ).pipe(Config.map((value) => ProjectKey.make(value)));
      const region = yield* Config.nonEmptyString("COMMERCETOOLS_REGION").pipe(
        Config.map((value) => CommercetoolsRegion.make(value))
      );
      const clientId = yield* Config.nonEmptyString(
        "COMMERCETOOLS_BOOTSTRAP_CLIENT_ID"
      ).pipe(Config.map((value) => ApiClientId.make(value)));
      const clientSecret = yield* Config.redacted(
        "COMMERCETOOLS_BOOTSTRAP_CLIENT_SECRET"
      );

      return BootstrapCommercetoolsConfig.of({
        clientId,
        clientSecret,
        projectKey,
        region,
      });
    })
  );
}
