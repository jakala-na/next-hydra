import { RuntimeEnvironmentPublisher } from "@repo/cli-core/runtime-environment";
import type { RuntimeEnvironmentDestination } from "@repo/cli-core/runtime-environment";
import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import { Console, Effect } from "effect";

import { contentIndexSettings } from "../../content-mapping";
import { createAlgoliaIndexGraph } from "../../index-graph";
import type { AlgoliaIndexGraph, StoreConfiguration } from "../../index-graph";
import { AlgoliaAdministration } from "./administration";
import { AlgoliaProvisioningConfig } from "./config";
import { managedAlgoliaResourceNames } from "./managed-resource-names";
import { AlgoliaProvisioningReceipt } from "./model";
import type { AlgoliaProvisioningError } from "./model";
import {
  searchRuntimeEnvironment,
  searchRuntimeEnvironmentManifest,
} from "./runtime-credentials";

export interface ProvisionAlgoliaOptions {
  readonly products?:
    | {
        readonly storefronts: StoreConfiguration;
        readonly priceCustomerGroupIds: readonly string[];
        readonly provision: (graph: AlgoliaIndexGraph) => Effect.Effect<
          {
            readonly connectors: number;
            readonly managedCommerceApiClientId?: string | undefined;
          },
          AlgoliaProvisioningError,
          AlgoliaAdministration | AlgoliaProvisioningConfig
        >;
      }
    | undefined;
  readonly contentProjection: ContentSearchProjection;
  readonly destination: RuntimeEnvironmentDestination;
  readonly indexPrefix: string | undefined;
  readonly locales: readonly string[];
}

const progress = (message: string) => Console.log(`  ${message}`);

export const provisionAlgolia = Effect.fn("AlgoliaProvisioning.provision")(
  function* (options: ProvisionAlgoliaOptions) {
    const administration = yield* AlgoliaAdministration;

    const config = yield* AlgoliaProvisioningConfig;
    const publisher = yield* RuntimeEnvironmentPublisher;
    const graph = yield* createAlgoliaIndexGraph(
      options.indexPrefix,
      options.locales,
      options.contentProjection,
      options.products?.storefronts
    );
    const { contentProjection } = options;
    const managedNames = managedAlgoliaResourceNames(graph.prefix);

    const preparedDestination = yield* publisher.prepare({
      destination: options.destination,
      manifest: searchRuntimeEnvironmentManifest(
        graph.prefix,
        options.products !== undefined
      ),
    });

    yield* Console.log("Provisioning Algolia search resources...");

    const productReceipt =
      options.products === undefined
        ? { connectors: 0, managedCommerceApiClientId: undefined }
        : yield* options.products.provision(graph);

    yield* Effect.forEach(
      graph.contentIndices,
      ({ indexName, locales }) =>
        progress(
          `Configuring Content index "${indexName}" for ${locales.join(", ")}...`
        ).pipe(
          Effect.andThen(
            administration.configureIndex({
              indexName,
              settings: contentIndexSettings(contentProjection, locales),
            })
          )
        ),
      { discard: true }
    );
    yield* Effect.forEach(
      graph.querySuggestions,
      (suggestions) =>
        progress(
          `Configuring Query Suggestions index "${suggestions.indexName}" for ${suggestions.locale} from ${suggestions.sources.map(({ indexName, analyticsTags }) => `"${indexName}" (${analyticsTags.join(", ")})`).join(" and ")}...`
        ).pipe(
          Effect.andThen(administration.configureQuerySuggestions(suggestions))
        ),
      { discard: true }
    );

    yield* progress(
      `Creating or updating the scoped runtime search API key for ${graph.queryableIndexNames.length} queryable indices...`
    );
    const searchApiKey = yield* administration.configureSearchKey({
      description: managedNames.searchKey.name,
      indexNames: graph.queryableIndexNames,
      legacyDescriptions: managedNames.searchKey.legacyNames,
    });
    yield* progress("Publishing runtime search credentials...");
    yield* publisher.publish(
      preparedDestination,
      searchRuntimeEnvironment({
        applicationId: config.applicationId,
        indexPrefix: graph.prefix,
        priceCustomerGroupIds: options.products?.priceCustomerGroupIds,
        searchApiKey,
      })
    );
    yield* progress("Runtime search credentials published.");

    const receipt = {
      connectors: productReceipt.connectors,
      contentIndices: graph.contentIndices.length,
      indexPrefix: graph.prefix,
      initialReindexes: productReceipt.connectors,
      productPrimaries: graph.productPrimaries.length,
      productReplicas: graph.productPrimaries.flatMap(
        ({ replicas }) => replicas
      ).length,
      querySuggestions: graph.querySuggestions.length,
    };
    return productReceipt.managedCommerceApiClientId === undefined
      ? new AlgoliaProvisioningReceipt(receipt)
      : new AlgoliaProvisioningReceipt({
          ...receipt,
          managedCommerceApiClientId: productReceipt.managedCommerceApiClientId,
        });
  }
);
