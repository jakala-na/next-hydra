import type { Redacted } from "effect";
import { Config, Context, Effect, Layer } from "effect";

import { parsePriceCustomerGroupIds } from "../../price-audience";
import { AlgoliaRegion } from "./model";

interface AlgoliaProvisioningConfigValue {
  readonly adminApiKey: Redacted.Redacted;
  readonly applicationId: string;
  readonly priceCustomerGroupIds: readonly string[];
  readonly region: AlgoliaRegion;
}

export class AlgoliaProvisioningConfig extends Context.Service<
  AlgoliaProvisioningConfig,
  AlgoliaProvisioningConfigValue
>()("@repo/search-algolia/ProvisioningConfig") {
  static readonly layer = Layer.effect(
    AlgoliaProvisioningConfig,
    Effect.gen(function* () {
      const applicationId = yield* Config.nonEmptyString(
        "ALGOLIA_APPLICATION_ID"
      );
      const adminApiKey = yield* Config.redacted("ALGOLIA_ADMIN_API_KEY");
      const priceCustomerGroupIds = yield* Config.string(
        "ALGOLIA_PRICE_CUSTOMER_GROUP_IDS"
      ).pipe(Config.withDefault(""), Config.map(parsePriceCustomerGroupIds));
      const region = yield* Config.schema(AlgoliaRegion, "ALGOLIA_REGION");

      return AlgoliaProvisioningConfig.of({
        adminApiKey,
        applicationId,
        priceCustomerGroupIds,
        region,
      });
    })
  );
}
