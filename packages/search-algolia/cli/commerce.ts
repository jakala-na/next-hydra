import { fileURLToPath } from "node:url";

import { storeConfiguration } from "@repo/commerce/store";
import { Config, ConfigProvider, Effect } from "effect";

import type { AlgoliaIndexGraph } from "../index-graph";
import { parsePriceCustomerGroupIds } from "../price-audience";
import type { AlgoliaCommerceConnectorSource } from "./provisioning/commerce-connector-source";
import { AlgoliaProvisioningError } from "./provisioning/model";
import { provisionAlgoliaProducts } from "./provisioning/provision-products";
import { generateAlgoliaCommercetoolsTransformation } from "./transform-generator";
import { generateAlgoliaCommercetoolsProductTypes } from "./typegen";

const GENERATED_CONNECTOR_PRODUCT_FILE = fileURLToPath(
  new URL("../connector/commercetools/generated-product.ts", import.meta.url)
);
const CONNECTOR_TRANSFORMATION_SOURCE_FILE = fileURLToPath(
  new URL("../connector/commercetools/transform.ts", import.meta.url)
);
const GENERATED_CONNECTOR_TRANSFORMATION_FILE = fileURLToPath(
  new URL("../connector/commercetools/generated-transform.ts", import.meta.url)
);

export const createCommerceSearch = <E>(source: {
  readonly create: (
    provider: Effect.Effect<ConfigProvider.ConfigProvider>
  ) => Effect.Effect<AlgoliaCommerceConnectorSource, E>;
  readonly productTypeSchemaDirectory: string;
}) => ({
  generateTypes: () =>
    Effect.tryPromise({
      catch: (cause) =>
        new AlgoliaProvisioningError({
          cause,
          message: "Algolia connector type generation failed",
          operation: "connector type generation",
        }),
      try: async () => {
        await Promise.all([
          generateAlgoliaCommercetoolsProductTypes({
            currencies: [
              ...new Set(storeConfiguration.map(({ currency }) => currency)),
            ],
            locales: [
              ...new Set(storeConfiguration.map(({ locale }) => locale)),
            ],
            outputFile: GENERATED_CONNECTOR_PRODUCT_FILE,
            schemaDirectory: source.productTypeSchemaDirectory,
          }),
          generateAlgoliaCommercetoolsTransformation({
            outputFile: GENERATED_CONNECTOR_TRANSFORMATION_FILE,
            sourceFile: CONNECTOR_TRANSFORMATION_SOURCE_FILE,
          }),
        ]);
      },
    }),
  prepare: (provider: Effect.Effect<ConfigProvider.ConfigProvider>) =>
    Effect.gen(function* () {
      const commerceSource = yield* source.create(provider);
      const priceCustomerGroupIds = yield* Config.String(
        "ALGOLIA_PRICE_CUSTOMER_GROUP_IDS"
      ).pipe(
        Config.withDefault(""),
        Config.map(parsePriceCustomerGroupIds),
        Effect.provide(ConfigProvider.layer(provider))
      );
      return {
        priceCustomerGroupIds,
        provision: (graph: AlgoliaIndexGraph) =>
          provisionAlgoliaProducts(
            graph,
            commerceSource,
            priceCustomerGroupIds
          ),
        storefronts: storeConfiguration,
      };
    }),
  storefronts: storeConfiguration,
});
