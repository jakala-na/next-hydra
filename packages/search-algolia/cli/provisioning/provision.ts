import { note, phase } from "@repo/cli-core/command-output";
import { RuntimeEnvironmentPublisher } from "@repo/cli-core/runtime-environment";
import type { RuntimeEnvironmentDestination } from "@repo/cli-core/runtime-environment";
import type { ContentIndexingOperation } from "@repo/search/content-indexing";
import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import { Effect } from "effect";

import { contentIndexSettings } from "../../content-mapping";
import { createAlgoliaIndexGraph } from "../../index-graph";
import type { AlgoliaIndexGraph, StoreConfiguration } from "../../index-graph";
import { AlgoliaAdministration } from "./administration";
import { AlgoliaProvisioningConfig } from "./config";
import { managedAlgoliaResourceNames } from "./managed-resource-names";
import { AlgoliaProvisioningReceipt } from "./model";
import type { AlgoliaProvisioningError } from "./model";
import { contentIndexStep, searchSteps, suggestionsStep } from "./output";
import {
  searchRuntimeEnvironment,
  searchRuntimeEnvironmentManifest,
  contentRuntimeEnvironmentManifest,
} from "./runtime-credentials";

export interface ProvisionAlgoliaOptions {
  readonly contentIndexingOperations: readonly ContentIndexingOperation[];
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
    const contentIndexName =
      graph.contentIndices.length === 1
        ? graph.contentIndices[0]?.indexName
        : undefined;

    if (options.destination.destination === "vercel") {
      yield* note(
        "Search and Content write credentials will be available to the Vercel web application's server runtime. Sensitive keys cannot be read back from Vercel; use local output when you need to copy credentials to your CMS."
      );
    }
    const runtimeEnvironment = [
      ...searchRuntimeEnvironmentManifest(
        graph.prefix,
        options.products !== undefined
      ),
      ...contentRuntimeEnvironmentManifest(contentIndexName !== undefined),
    ];
    const preparedDestination = yield* phase(
      searchSteps.destination,
      publisher.prepare({
        destination: options.destination,
        manifest: runtimeEnvironment,
      })
    );

    const productReceipt =
      options.products === undefined
        ? { connectors: 0, managedCommerceApiClientId: undefined }
        : yield* options.products.provision(graph);

    yield* Effect.forEach(
      graph.contentIndices,
      ({ indexName, locales }) =>
        phase(
          contentIndexStep(indexName, locales),
          administration.configureIndex({
            indexName,
            settings: contentIndexSettings(contentProjection, locales),
          })
        ),
      { discard: true }
    );
    yield* Effect.forEach(
      graph.querySuggestions,
      (suggestions) =>
        phase(
          suggestionsStep(suggestions.indexName, suggestions.locale),
          administration.configureQuerySuggestions(suggestions)
        ),
      { discard: true }
    );

    const contentWriteApiKey = yield* phase(
      searchSteps.contentKey,
      administration.configureContentKey({
        description: managedNames.contentKey.name,
        indexNames: graph.contentIndices.map(({ indexName }) => indexName),
        operations: options.contentIndexingOperations,
      })
    );
    const contentKeyCredentials = {
      ALGOLIA_APPLICATION_ID: config.applicationId,
      ALGOLIA_CONTENT_WRITE_API_KEY: contentWriteApiKey,
    };
    const contentCredentials =
      contentIndexName === undefined
        ? contentKeyCredentials
        : {
            ...contentKeyCredentials,
            ALGOLIA_CONTENT_INDEX_NAME: contentIndexName,
          };

    const searchApiKey = yield* phase(
      searchSteps.searchKey,
      administration.configureSearchKey({
        description: managedNames.searchKey.name,
        indexNames: graph.queryableIndexNames,
        legacyDescriptions: managedNames.searchKey.legacyNames,
      })
    );
    const publication = yield* phase(
      searchSteps.publication,
      publisher.publish(preparedDestination, {
        ...contentCredentials,
        ...searchRuntimeEnvironment({
          applicationId: config.applicationId,
          indexPrefix: graph.prefix,
          priceCustomerGroupIds: options.products?.priceCustomerGroupIds,
          searchApiKey,
        }),
      })
    );

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
    const provisioningReceipt =
      productReceipt.managedCommerceApiClientId === undefined
        ? new AlgoliaProvisioningReceipt(receipt)
        : new AlgoliaProvisioningReceipt({
            ...receipt,
            managedCommerceApiClientId:
              productReceipt.managedCommerceApiClientId,
          });
    return {
      contentCredentials,
      contentIndexNames: graph.contentIndices.map(({ indexName }) => indexName),
      publication,
      receipt: provisioningReceipt,
      runtimeEnvironment,
    };
  }
);
