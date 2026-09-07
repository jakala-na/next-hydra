import { RuntimeEnvironmentPublisher } from "@repo/cli-core/runtime-environment";
import type { RuntimeEnvironmentDestination } from "@repo/cli-core/runtime-environment";
import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import { Console, Effect } from "effect";

import {
  algoliaConnectorCurrency,
  algoliaConnectorLocale,
} from "../../connector/commercetools/generated-product";
import { ALGOLIA_COMMERCETOOLS_TRANSFORMATION_SOURCE } from "../../connector/commercetools/generated-transform";
import { ALGOLIA_COMMERCETOOLS_CONNECTOR_SCOPE_NAMES } from "../../connector/commercetools/scopes";
import {
  ALGOLIA_COMMERCETOOLS_CONFIGURATION_SECRET_NAME,
  serializeAlgoliaCommercetoolsTransformationConfiguration,
} from "../../connector/commercetools/transform";
import type { AlgoliaCommercetoolsTransformationConfiguration } from "../../connector/commercetools/transform";
import { contentIndexSettings } from "../../content-mapping";
import { createAlgoliaIndexGraph } from "../../index-graph";
import { productIndexSettings } from "../../index-settings";
import { AlgoliaAdministration } from "./administration";
import type { ConfigureCommercetoolsAuthenticationOptions } from "./administration";
import type {
  AlgoliaCommerceConnectorSource,
  ReconcileManagedCommerceApiClientInput,
} from "./commerce-connector-source";
import { AlgoliaProvisioningConfig } from "./config";
import { managedAlgoliaResourceNames } from "./managed-resource-names";
import { AlgoliaProvisioningError, AlgoliaProvisioningReceipt } from "./model";
import {
  searchRuntimeEnvironment,
  searchRuntimeEnvironmentManifest,
} from "./runtime-credentials";

export interface ProvisionAlgoliaOptions {
  readonly commerceConnectorSource: AlgoliaCommerceConnectorSource;
  readonly contentProjection: ContentSearchProjection;
  readonly destination: RuntimeEnvironmentDestination;
  readonly indexPrefix: string | undefined;
  readonly locales: readonly string[];
}

const uniqueAlgoliaLocales = (locales: readonly string[]) => [
  ...new Set(locales.map(algoliaConnectorLocale)),
];

const progress = (message: string) => Console.log(`  ${message}`);

export const provisionAlgolia = Effect.fn("AlgoliaProvisioning.provision")(
  function* (options: ProvisionAlgoliaOptions) {
    const administration = yield* AlgoliaAdministration;
    const { commerceConnectorSource } = options;
    const config = yield* AlgoliaProvisioningConfig;
    const publisher = yield* RuntimeEnvironmentPublisher;
    const graph = yield* createAlgoliaIndexGraph(
      options.indexPrefix,
      options.locales,
      options.contentProjection
    );
    const { contentProjection } = options;
    const managedNames = managedAlgoliaResourceNames(graph.prefix);

    const preparedDestination = yield* publisher.prepare({
      destination: options.destination,
      manifest: searchRuntimeEnvironmentManifest(graph.prefix),
    });

    yield* Console.log("Provisioning Algolia search resources...");

    yield* Effect.forEach(
      graph.productPrimaries,
      ({ indexName, replicas, storefronts }) => {
        const productStorefronts = storefronts.map(({ currency, locale }) => ({
          currency: algoliaConnectorCurrency(currency),
          locale: algoliaConnectorLocale(locale),
        }));
        const locales = uniqueAlgoliaLocales(
          storefronts.map(({ locale }) => locale)
        );
        return progress(
          `Configuring Product index "${indexName}" for ${locales.join(", ")}...`
        ).pipe(
          Effect.andThen(
            administration.configureIndex({
              indexName,
              settings: {
                ...productIndexSettings({
                  sort: "relevance",
                  storefronts: productStorefronts,
                }),
                replicas: replicas.map((replica) => replica.indexName),
              },
            })
          )
        );
      },
      { discard: true }
    );
    yield* Effect.forEach(
      graph.productPrimaries.flatMap(({ replicas, storefronts }) => {
        const productStorefronts = storefronts.map(({ currency, locale }) => ({
          currency: algoliaConnectorCurrency(currency),
          locale: algoliaConnectorLocale(locale),
        }));
        return replicas.map((replica) => ({ productStorefronts, replica }));
      }),
      ({ productStorefronts, replica: { currency, indexName, sort } }) => {
        const sortDirection = sort === "price-asc" ? "ascending" : "descending";
        return progress(
          `Configuring Product replica "${indexName}" for ${currency} with ${sortDirection} price...`
        ).pipe(
          Effect.andThen(
            administration.configureIndex({
              indexName,
              settings: productIndexSettings({
                currency: algoliaConnectorCurrency(currency),
                sort,
                storefronts: productStorefronts,
              }),
            })
          )
        );
      },
      { discard: true }
    );
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
      `Creating or updating the scoped connector API key for ${graph.productPrimaries.length} Product indices...`
    );
    const connectorApiKey = yield* administration.configureConnectorKey({
      description: managedNames.connectorKey.name,
      indexNames: graph.productPrimaries.map(({ indexName }) => indexName),
      legacyDescriptions: managedNames.connectorKey.legacyNames,
    });
    yield* progress(
      "Creating or updating the Algolia destination authentication..."
    );
    const algoliaAuthenticationId =
      yield* administration.configureAlgoliaDestinationAuthentication({
        apiKey: connectorApiKey,
        applicationId: config.applicationId,
        legacyNames: managedNames.algoliaDestinationAuthentication.legacyNames,
        name: managedNames.algoliaDestinationAuthentication.name,
      });
    const priceCustomerGroupCount = config.priceCustomerGroupIds.length;
    yield* progress(
      `Reading commerce Stores and validating ${priceCustomerGroupCount} pricing Customer Group ${priceCustomerGroupCount === 1 ? "ID" : "IDs"}...`
    );
    const indexingContext = yield* commerceConnectorSource
      .resolveContext({
        priceCustomerGroupIds: config.priceCustomerGroupIds,
        storeKeys: graph.productPrimaries.map(({ storeKey }) => storeKey),
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new AlgoliaProvisioningError({
              cause,
              message: "Could not resolve commerce connector context",
              operation: "commerce connector context",
            })
        )
      );
    const commercetoolsAuthenticationName =
      managedNames.commercetoolsAuthentication;
    yield* progress(
      "Checking the existing commercetools connector authentication..."
    );
    const existingCommercetoolsAuthentication =
      yield* administration.findCommercetoolsAuthentication(
        commercetoolsAuthenticationName
      );
    let managedCommerceApiClientId: string | undefined;
    const managedClientInput: ReconcileManagedCommerceApiClientInput = {
      name: managedNames.commerceApiClient.name,
      scopeNames: ALGOLIA_COMMERCETOOLS_CONNECTOR_SCOPE_NAMES,
    };
    if (existingCommercetoolsAuthentication?.clientId !== undefined) {
      managedClientInput.existingClientId =
        existingCommercetoolsAuthentication.clientId;
    }
    if (existingCommercetoolsAuthentication?.scope !== undefined) {
      managedClientInput.existingScope =
        existingCommercetoolsAuthentication.scope;
    }
    yield* progress(
      "Creating, updating, or verifying the managed commerce API Client..."
    );
    const managedClient = yield* commerceConnectorSource
      .reconcileManagedApiClient(managedClientInput)
      .pipe(
        Effect.mapError(
          (cause) =>
            new AlgoliaProvisioningError({
              cause,
              message: "Could not reconcile the commerce connector API Client",
              operation: "commerce connector API Client reconciliation",
            })
        )
      );
    let managedClientProgress: string;
    if (managedClient.status === "current") {
      managedClientProgress = `Managed commerce API Client "${managedClient.clientId}" is current.`;
    } else if (managedClient.replacedClientId === undefined) {
      managedClientProgress = `Managed commerce API Client "${managedClient.clientId}" was created.`;
    } else {
      managedClientProgress = `Managed commerce API Client "${managedClient.replacedClientId}" will be replaced by "${managedClient.clientId}".`;
    }
    yield* progress(managedClientProgress);
    const commercetoolsAuthenticationId =
      managedClient.status === "current" &&
      existingCommercetoolsAuthentication !== undefined
        ? existingCommercetoolsAuthentication.authenticationId
        : yield* Effect.gen(function* () {
            if (managedClient.status !== "created") {
              return yield* new AlgoliaProvisioningError({
                cause: new Error("Current API Client has no authentication"),
                message:
                  "Commerce API Client reconciliation returned an unusable authentication",
                operation: "commerce connector authentication",
              });
            }
            managedCommerceApiClientId = managedClient.clientId;
            yield* progress(
              "Creating or updating the commercetools connector authentication..."
            );
            const authenticationInput: ConfigureCommercetoolsAuthenticationOptions =
              {
                authUrl: indexingContext.authUrl,
                clientId: managedClient.clientId,
                clientSecret: managedClient.clientSecret,
                name: commercetoolsAuthenticationName.name,
                scope: managedClient.scope,
              };
            if (existingCommercetoolsAuthentication !== undefined) {
              authenticationInput.authenticationId =
                existingCommercetoolsAuthentication.authenticationId;
            }
            const authenticationId =
              yield* administration.configureCommercetoolsAuthentication(
                authenticationInput
              );
            if (managedClient.replacedClientId !== undefined) {
              yield* commerceConnectorSource
                .deleteManagedApiClient(managedClient.replacedClientId)
                .pipe(
                  Effect.mapError(
                    (cause) =>
                      new AlgoliaProvisioningError({
                        cause,
                        message:
                          "Could not remove the replaced commerce connector API Client",
                        operation: "commerce connector API Client cleanup",
                      })
                  )
                );
              yield* progress(
                `Removed replaced commerce API Client "${managedClient.replacedClientId}".`
              );
            }
            return authenticationId;
          });
    const connectorReceipts = yield* Effect.all(
      graph.productPrimaries.map((primary) => {
        const store = indexingContext.stores.find(
          ({ storeKey }) => storeKey === primary.storeKey
        );
        if (!store) {
          return Effect.fail(
            new AlgoliaProvisioningError({
              cause: new Error(`Commerce Store ${primary.storeKey} is missing`),
              message: `Commerce indexing context did not include Store ${primary.storeKey}`,
              operation: "commerce connector configuration",
            })
          );
        }
        const transformationConfiguration = {
          priceCustomerGroupIds: indexingContext.priceCustomerGroupIds,
        } satisfies AlgoliaCommercetoolsTransformationConfiguration;

        return Effect.gen(function* () {
          yield* progress(
            `Creating or updating the Product transformation configuration for Store "${store.storeKey}"...`
          );
          const transformationAuthenticationId =
            yield* administration.configureAlgoliaTransformationSecrets({
              legacyNames: managedNames.productTransformationConfiguration(
                store.storeKey
              ).legacyNames,
              name: managedNames.productTransformationConfiguration(
                store.storeKey
              ).name,
              values: {
                [ALGOLIA_COMMERCETOOLS_CONFIGURATION_SECRET_NAME]:
                  serializeAlgoliaCommercetoolsTransformationConfiguration(
                    transformationConfiguration
                  ),
              },
            });
          yield* progress(
            `Configuring the commercetools connector for Store "${store.storeKey}" and Product index "${primary.indexName}"...`
          );
          yield* progress(
            "Applying the source, Product transformation, destination, task, and waiting for the initial reindex..."
          );
          const receipt = yield* administration.configureCommercetoolsConnector(
            {
              algoliaAuthenticationId,
              commercetoolsAuthenticationId,
              indexName: primary.indexName,
              legacyNames: managedNames.productConnector(store.storeKey)
                .legacyNames,
              locales: primary.storefronts.map(({ locale }) => locale),
              name: managedNames.productConnector(store.storeKey).name,
              projectKey: indexingContext.projectKey,
              storeKey: store.storeKey,
              transformationAuthenticationIds: [transformationAuthenticationId],
              transformationCode: ALGOLIA_COMMERCETOOLS_TRANSFORMATION_SOURCE,
              url: indexingContext.apiUrl,
            }
          );
          yield* progress(
            `Completed initial reindex "${receipt.runId}" for Store "${store.storeKey}".`
          );
          return receipt;
        });
      })
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
        priceCustomerGroupIds: config.priceCustomerGroupIds,
        searchApiKey,
      })
    );
    yield* progress("Runtime search credentials published.");

    const receipt = {
      connectors: connectorReceipts.length,
      contentIndices: graph.contentIndices.length,
      indexPrefix: graph.prefix,
      initialReindexes: connectorReceipts.length,
      productPrimaries: graph.productPrimaries.length,
      productReplicas: graph.productPrimaries.flatMap(
        ({ replicas }) => replicas
      ).length,
      querySuggestions: graph.querySuggestions.length,
    };
    return managedCommerceApiClientId === undefined
      ? new AlgoliaProvisioningReceipt(receipt)
      : new AlgoliaProvisioningReceipt({
          ...receipt,
          managedCommerceApiClientId,
        });
  }
);
