import { RuntimeEnvironmentPublisher } from "@repo/cli-core/runtime-environment";
import type { RuntimeEnvironmentValues } from "@repo/cli-core/runtime-environment";
import { storeConfiguration } from "@repo/commerce/store";
import { createCanonicalContentSearchProjection } from "@repo/search/content-search-projection";
import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import { Effect, Layer, Redacted } from "effect";
import {
  layer as testConsoleLayer,
  logLines as testConsoleLogLines,
} from "effect/testing/TestConsole";
import { describe, expect, it, vi } from "vitest";

import { ALGOLIA_COMMERCETOOLS_TRANSFORMATION_SOURCE } from "../../connector/commercetools/generated-transform";
import { ALGOLIA_COMMERCETOOLS_CONFIGURATION_SECRET_NAME } from "../../connector/commercetools/transform";
import { createAlgoliaIndexGraph } from "../../index-graph";
import { AlgoliaAdministration } from "./administration";
import type { AlgoliaCommerceConnectorSource } from "./commerce-connector-source";
import { AlgoliaProvisioningConfig } from "./config";
import { provisionAlgolia } from "./provision";
import { provisionAlgoliaProducts } from "./provision-products";
import {
  searchRuntimeEnvironment,
  searchRuntimeEnvironmentManifest,
} from "./runtime-credentials";

describe(provisionAlgolia, () => {
  it("omits the runtime prefix variable for unprefixed indices", () => {
    expect(
      searchRuntimeEnvironment({
        applicationId: "application-id",
        indexPrefix: "",
        priceCustomerGroupIds: [],
        searchApiKey: Redacted.make("runtime-search-key"),
      })
    ).not.toHaveProperty("ALGOLIA_INDEX_PREFIX");
    expect(
      searchRuntimeEnvironmentManifest("").map(({ key }) => key)
    ).not.toContain("ALGOLIA_INDEX_PREFIX");
  });

  it("provisions every configured Store and locale before publishing runtime credentials", async () => {
    const configureIndex = vi.fn<
      AlgoliaAdministration["Service"]["configureIndex"]
    >(() => Effect.void);
    const configureAlgoliaDestinationAuthentication = vi.fn<
      AlgoliaAdministration["Service"]["configureAlgoliaDestinationAuthentication"]
    >(() => Effect.succeed("algolia-authentication-id"));
    const configureConnectorKey = vi.fn<
      AlgoliaAdministration["Service"]["configureConnectorKey"]
    >(() => Effect.succeed(Redacted.make("connector-key")));
    const configureAlgoliaTransformationSecrets = vi.fn<
      AlgoliaAdministration["Service"]["configureAlgoliaTransformationSecrets"]
    >(({ name }) => Effect.succeed(`secrets:${name}`));
    const configureCommercetoolsConnector = vi.fn<
      AlgoliaAdministration["Service"]["configureCommercetoolsConnector"]
    >(() =>
      Effect.succeed({
        destinationId: "destination-id",
        runId: "run-id",
        sourceId: "source-id",
        taskId: "task-id",
        transformationId: "transformation-id",
      })
    );
    const configureQuerySuggestions = vi.fn<
      AlgoliaAdministration["Service"]["configureQuerySuggestions"]
    >(() => Effect.void);
    const configureSearchKey = vi.fn<
      AlgoliaAdministration["Service"]["configureSearchKey"]
    >(() => Effect.succeed(Redacted.make("runtime-search-key")));
    const configureCommercetoolsAuthentication = vi.fn<
      AlgoliaAdministration["Service"]["configureCommercetoolsAuthentication"]
    >(() => Effect.succeed("commercetools-authentication-id"));
    const findCommercetoolsAuthentication = vi
      .fn<AlgoliaAdministration["Service"]["findCommercetoolsAuthentication"]>()
      .mockReturnValueOnce(Effect.void.pipe(Effect.as(undefined)))
      .mockReturnValue(
        Effect.succeed({
          authenticationId: "commercetools-authentication-id",
          clientId: "connector-client-id",
          scope: "view_products:project-key",
        })
      );
    const reconcileManagedApiClient = vi
      .fn<AlgoliaCommerceConnectorSource["reconcileManagedApiClient"]>()
      .mockReturnValueOnce(
        Effect.succeed({
          clientId: "connector-client-id",
          clientSecret: Redacted.make("connector-client-secret"),
          scope: "view_products:project-key",
          status: "created" as const,
        })
      )
      .mockReturnValueOnce(
        Effect.succeed({
          clientId: "connector-client-id",
          scope: "view_products:project-key",
          status: "current" as const,
        })
      )
      .mockReturnValue(
        Effect.succeed({
          clientId: "replacement-client-id",
          clientSecret: Redacted.make("replacement-client-secret"),
          replacedClientId: "connector-client-id",
          scope: "view_products:project-key view_stores:project-key",
          status: "created" as const,
        })
      );
    const deleteManagedApiClient = vi.fn<
      AlgoliaCommerceConnectorSource["deleteManagedApiClient"]
    >(() => Effect.void);
    const commerceConnectorSource = {
      deleteManagedApiClient,
      reconcileManagedApiClient,
      resolveContext: ({
        priceCustomerGroupIds,
        storeKeys,
      }: {
        readonly priceCustomerGroupIds: readonly string[];
        readonly storeKeys: readonly string[];
      }) =>
        Effect.succeed({
          apiUrl: "https://api.us-central1.gcp.commercetools.com",
          authUrl: "https://auth.us-central1.gcp.commercetools.com",
          priceCustomerGroupIds,
          projectKey: "project-key",
          stores: storeKeys.map((storeKey) => ({ storeKey })),
        }),
    };
    const prepare = vi.fn<RuntimeEnvironmentPublisher["Service"]["prepare"]>(
      ({ manifest }) =>
        Effect.succeed({
          destination: "local",
          manifest: [...manifest],
          path: "/tmp/.env.algolia.local",
        })
    );
    let publishedValues: RuntimeEnvironmentValues | undefined;
    const publish: RuntimeEnvironmentPublisher["Service"]["publish"] = (
      _prepared,
      values
    ) => {
      publishedValues = values;
      return Effect.succeed({
        destination: "local" as const,
        mode: 0,
        path: "/tmp/.env.algolia.local",
      });
    };
    const locales = ["en-US", "de-DE"] as const;
    const selectedLocales = new Set<string>(locales);
    const configuredStorefronts = storeConfiguration.filter(({ locale }) =>
      selectedLocales.has(locale)
    );
    const contentSearchableAttributes = vi.fn<
      ContentSearchProjection["searchableAttributes"]
    >((configuredLocales) =>
      configuredLocales.map((locale) => ({
        attribute: `articles.dev.${locale}`,
        ordered: true,
      }))
    );
    const contentProjection = {
      ...createCanonicalContentSearchProjection("acceptance--content"),
      searchableAttributes: contentSearchableAttributes,
    };
    const graph = Effect.runSync(
      createAlgoliaIndexGraph(
        "acceptance",
        locales,
        contentProjection,
        storeConfiguration
      )
    );
    const TestLayer = Layer.mergeAll(
      AlgoliaAdministration.layerFrom({
        configureAlgoliaDestinationAuthentication,
        configureAlgoliaTransformationSecrets,
        configureCommercetoolsAuthentication,
        configureCommercetoolsConnector,
        configureConnectorKey,
        configureIndex,
        configureQuerySuggestions,
        configureSearchKey,
        findCommercetoolsAuthentication,
      }),
      Layer.succeed(
        AlgoliaProvisioningConfig,
        AlgoliaProvisioningConfig.of({
          adminApiKey: Redacted.make("admin-key"),
          applicationId: "application-id",
          region: "us",
        })
      ),
      RuntimeEnvironmentPublisher.layerFrom({ prepare, publish })
    );
    const ProvisionTestLayer = Layer.mergeAll(TestLayer, testConsoleLayer);

    const { progressLines, receipt } = await Effect.gen(function* () {
      const provisioningReceipt = yield* provisionAlgolia({
        contentProjection,
        destination: {
          destination: "local",
          output: ".env.algolia.local",
          publicationMode: "create",
          yes: true,
        },
        indexPrefix: "acceptance",
        locales,
        products: {
          priceCustomerGroupIds: ["contractors-id"],
          provision: (graph) =>
            provisionAlgoliaProducts(graph, commerceConnectorSource, [
              "contractors-id",
            ]),
          storefronts: storeConfiguration,
        },
      });
      const capturedProgressLines = yield* testConsoleLogLines;
      return {
        progressLines: capturedProgressLines,
        receipt: provisioningReceipt,
      };
    }).pipe(Effect.provide(ProvisionTestLayer), Effect.runPromise);

    expect({
      configureIndexCalls: configureIndex.mock.calls.length,
      configureQuerySuggestionsCalls:
        configureQuerySuggestions.mock.calls.length,
      receipt,
    }).toMatchObject({
      configureIndexCalls:
        graph.productPrimaries.length +
        graph.productPrimaries.flatMap(({ replicas }) => replicas).length +
        1,
      configureQuerySuggestionsCalls: configuredStorefronts.length,
      receipt: {
        connectors: graph.productPrimaries.length,
        contentIndices: 1,
        initialReindexes: graph.productPrimaries.length,
        managedCommerceApiClientId: "connector-client-id",
        productPrimaries: new Set(
          configuredStorefronts.map(({ storeKey }) => storeKey)
        ).size,
        productReplicas: configuredStorefronts.length * 2,
        querySuggestions: configuredStorefronts.length,
      },
    });
    expect({
      contentIndex: configureIndex.mock.calls.find(
        ([{ indexName }]) => indexName === "acceptance--content"
      )?.[0],
      contentSettingsLocales: contentSearchableAttributes.mock.calls[0]?.[0],
      searchKey: configureSearchKey.mock.calls[0]?.[0],
    }).toEqual({
      contentIndex: {
        indexName: "acceptance--content",
        settings: {
          attributesForFaceting: ["filterOnly(locales)"],
          attributesToRetrieve: ["objectID", "contentCard"],
          searchableAttributes: ["articles.dev.en-US", "articles.dev.de-DE"],
          unretrievableAttributes: ["locales"],
        },
      },
      contentSettingsLocales: locales,
      searchKey: {
        description: "Managed runtime search key (acceptance)",
        indexNames: graph.queryableIndexNames,
        legacyDescriptions: [],
      },
    });
    expect(progressLines).toEqual(
      expect.arrayContaining([
        "Provisioning Algolia search resources...",
        '  Configuring Product index "acceptance--products--default-store" for en-US...',
        '  Configuring Product replica "acceptance--products--default-store--USD--price-asc" for USD with ascending price...',
        '  Configuring Content index "acceptance--content" for en-US, de-DE...',
        '  Configuring Query Suggestions index "acceptance--query-suggestions--default-store--en-US" for en-US from "acceptance--products--default-store" (environment:acceptance|locale:en-us) and "acceptance--content" (environment:acceptance|locale:en-us)...',
        "  Creating or updating the scoped connector API key for 2 Product indices...",
        "  Creating or updating the Algolia destination authentication...",
        "  Reading commerce Stores and validating 1 pricing Customer Group ID...",
        "  Creating, updating, or verifying the managed commerce API Client...",
        '  Managed commerce API Client "connector-client-id" was created.',
        "  Creating or updating the commercetools connector authentication...",
        '  Creating or updating the Product transformation configuration for Store "default-store"...',
        '  Configuring the commercetools connector for Store "default-store" and Product index "acceptance--products--default-store"...',
        "  Applying the source, Product transformation, destination, task, and waiting for the initial reindex...",
        '  Completed initial reindex "run-id" for Store "default-store".',
        "  Creating or updating the scoped runtime search API key for 9 queryable indices...",
        "  Publishing runtime search credentials...",
        "  Runtime search credentials published.",
      ])
    );
    const publishedSearchKey = publishedValues?.ALGOLIA_SEARCH_API_KEY;
    if (!Redacted.isRedacted(publishedSearchKey)) {
      throw new Error("Expected a redacted runtime Search API key");
    }
    const transformationSecrets =
      configureAlgoliaTransformationSecrets.mock.calls[0]?.[0].values;
    const encodedTransformationConfiguration =
      transformationSecrets?.[ALGOLIA_COMMERCETOOLS_CONFIGURATION_SECRET_NAME];
    if (encodedTransformationConfiguration === undefined) {
      throw new Error("Expected a transformation configuration secret");
    }
    const transformationConfiguration: unknown = JSON.parse(
      encodedTransformationConfiguration
    );

    const repeatedReceipt = await provisionAlgolia({
      contentProjection,
      destination: {
        destination: "local",
        output: ".env.algolia.local",
        publicationMode: "overwrite",
        yes: true,
      },
      indexPrefix: "acceptance",
      locales,
      products: {
        priceCustomerGroupIds: ["contractors-id"],
        provision: (graph) =>
          provisionAlgoliaProducts(graph, commerceConnectorSource, [
            "contractors-id",
          ]),
        storefronts: storeConfiguration,
      },
    }).pipe(Effect.provide(ProvisionTestLayer), Effect.runPromise);

    const reconciledReceipt = await provisionAlgolia({
      contentProjection,
      destination: {
        destination: "local",
        output: ".env.algolia.local",
        publicationMode: "overwrite",
        yes: true,
      },
      indexPrefix: "acceptance",
      locales,
      products: {
        priceCustomerGroupIds: ["contractors-id"],
        provision: (graph) =>
          provisionAlgoliaProducts(graph, commerceConnectorSource, [
            "contractors-id",
          ]),
        storefronts: storeConfiguration,
      },
    }).pipe(Effect.provide(ProvisionTestLayer), Effect.runPromise);

    expect({
      authenticationCalls:
        configureCommercetoolsAuthentication.mock.calls.length,
      connectorCalls: configureCommercetoolsConnector.mock.calls.length,
      deletedClientIds: deleteManagedApiClient.mock.calls.map(
        ([clientId]) => clientId
      ),
      lastAuthentication:
        configureCommercetoolsAuthentication.mock.calls.at(-1)?.[0],
      managedClientCalls: reconcileManagedApiClient.mock.calls.length,
      publishedValues,
      repeatedManagedClientId: repeatedReceipt.managedCommerceApiClientId,
      replacementManagedClientId: reconciledReceipt.managedCommerceApiClientId,
      runtimeSearchKey: Redacted.value(publishedSearchKey),
      secretPublished: JSON.stringify(publishedValues).includes(
        "connector-client-secret"
      ),
      transformationAuthenticationIds:
        configureCommercetoolsConnector.mock.calls[0]?.[0]
          .transformationAuthenticationIds,
      transformationCode:
        configureCommercetoolsConnector.mock.calls[0]?.[0].transformationCode,
      transformationConfiguration,
      transformationSecrets,
    }).toMatchObject({
      authenticationCalls: 2,
      connectorCalls: graph.productPrimaries.length * 3,
      deletedClientIds: ["connector-client-id"],
      lastAuthentication: {
        authenticationId: "commercetools-authentication-id",
        clientId: "replacement-client-id",
        scope: "view_products:project-key view_stores:project-key",
      },
      managedClientCalls: 3,
      publishedValues: {
        ALGOLIA_APPLICATION_ID: "application-id",
        ALGOLIA_INDEX_PREFIX: "acceptance",
        ALGOLIA_PRICE_CUSTOMER_GROUP_IDS: "contractors-id",
      },
      repeatedManagedClientId: undefined,
      replacementManagedClientId: "replacement-client-id",
      runtimeSearchKey: "runtime-search-key",
      secretPublished: false,
      transformationAuthenticationIds: [
        "secrets:Managed Product transformation configuration (acceptance/default-store)",
      ],
      transformationCode: ALGOLIA_COMMERCETOOLS_TRANSFORMATION_SOURCE,
      transformationConfiguration: {
        priceCustomerGroupIds: ["contractors-id"],
        version: 4,
      },
      transformationSecrets: {
        [ALGOLIA_COMMERCETOOLS_CONFIGURATION_SECRET_NAME]:
          encodedTransformationConfiguration,
      },
    });
  });
});
