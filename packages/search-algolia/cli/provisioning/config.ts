import type { Redacted } from "effect";
import { Config, Context, Effect, Layer } from "effect";

import { AlgoliaRegion } from "./model";

interface AlgoliaProvisioningConfigValue {
  readonly adminApiKey: Redacted.Redacted;
  readonly applicationId: string;
  readonly region: AlgoliaRegion;
}

export class AlgoliaProvisioningConfig extends Context.Service<
  AlgoliaProvisioningConfig,
  AlgoliaProvisioningConfigValue
>()("@repo/search-algolia/ProvisioningConfig") {
  static readonly layer = Layer.effect(
    AlgoliaProvisioningConfig,
    Effect.gen(function* () {
      const applicationId = yield* Config.NonEmptyString(
        "ALGOLIA_APPLICATION_ID"
      );
      const adminApiKey = yield* Config.Redacted("ALGOLIA_ADMIN_API_KEY");
      const region = yield* Config.schema(AlgoliaRegion, "ALGOLIA_REGION");

      return AlgoliaProvisioningConfig.of({
        adminApiKey,
        applicationId,
        region,
      });
    })
  );
}
