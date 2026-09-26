import { fileURLToPath } from "node:url";

import {
  runtimeEnvironmentDestinationFlags,
  runtimeEnvironmentDestinationFromFlags,
} from "@repo/cli-core/runtime-environment-cli";
import { storeConfiguration } from "@repo/commerce/store";
import type { InstalledContentSearchApp } from "@repo/search/content-search-app";
import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import type { ConfigProvider, Effect as EffectType } from "effect";
import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { contentIndexName } from "../index-graph";
import type { ContentIndexingHandoff } from "./content-indexing-handoff";
import { formatContentIndexingHandoff } from "./content-indexing-handoff";
import type { ContentSearchAppHook } from "./content-search-app-hook";
import { requireContentSearchAppHook } from "./content-search-app-hook";
import { searchCliError } from "./error-message";
import { createSearchProvisioningLayer } from "./layer";
import type { AlgoliaCommerceConnectorSource } from "./provisioning/commerce-connector-source";
import type { AlgoliaProvisioningReceipt } from "./provisioning/model";
import { AlgoliaProvisioningError } from "./provisioning/model";
import { formatAlgoliaProvisioningPlan } from "./provisioning/plan";
import { provisionAlgolia } from "./provisioning/provision";
import { generateAlgoliaCommercetoolsTransformation } from "./transform-generator";
import { generateAlgoliaCommercetoolsProductTypes } from "./typegen";

export interface SearchCliComposition<CommerceError, ContentError> {
  readonly commerce: {
    readonly create: (
      configProvider: EffectType.Effect<ConfigProvider.ConfigProvider>
    ) => EffectType.Effect<AlgoliaCommerceConnectorSource, CommerceError>;
    readonly productTypeSchemaDirectory: string;
  };
  readonly content: {
    readonly createIndexingHandoff: (
      indexName: string
    ) => ContentIndexingHandoff;
    readonly createProjection: (
      indexName: string,
      configProvider: EffectType.Effect<ConfigProvider.ConfigProvider>
    ) => EffectType.Effect<ContentSearchProjection, ContentError>;
    /**
     * Installs the CMS provider's content search app. Providers without a
     * search app (Drupal) omit the hook; the CLI then reports their manual
     * indexing handoff instead.
     */
    readonly installContentSearchApp?: ContentSearchAppHook<ContentError>;
  };
}

const GENERATED_CONNECTOR_PRODUCT_FILE = fileURLToPath(
  new URL("../connector/commercetools/generated-product.ts", import.meta.url)
);
const CONNECTOR_TRANSFORMATION_SOURCE_FILE = fileURLToPath(
  new URL("../connector/commercetools/transform.ts", import.meta.url)
);
const GENERATED_CONNECTOR_TRANSFORMATION_FILE = fileURLToPath(
  new URL("../connector/commercetools/generated-transform.ts", import.meta.url)
);

const asUserError = <A, E, R>(effect: EffectType.Effect<A, E, R>) =>
  effect.pipe(Effect.catchCause((cause) => Effect.fail(searchCliError(cause))));

export const createSearchCommand = <E, R, CommerceError, ContentError>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>,
  composition: SearchCliComposition<CommerceError, ContentError>
) => {
  interface SearchProvisionResult {
    readonly contentSearchApp: InstalledContentSearchApp | undefined;
    readonly receipt: AlgoliaProvisioningReceipt | undefined;
  }

  const provision = Command.make(
    "provision",
    {
      dryRun: Flag.boolean("dry-run").pipe(
        Flag.withDescription(
          "Print the complete Store and locale resource graph without changing Algolia"
        ),
        Flag.withDefault(false)
      ),
      indexPrefix: Flag.string("index-prefix").pipe(
        Flag.withDescription(
          "Optional namespace prepended to every managed Algolia index"
        ),
        Flag.optional
      ),
      installContentSearchApp: Flag.boolean("install-content-search-app").pipe(
        Flag.withDescription(
          "Install and configure the composed CMS provider's content search app for the provisioned Content index (Contentstack only)"
        ),
        Flag.withDefault(false)
      ),
      locales: Flag.string("locale").pipe(
        Flag.withDescription(
          "Commerce locale to provision; repeat for every deployment locale"
        ),
        Flag.atLeast(1)
      ),
      ...runtimeEnvironmentDestinationFlags(),
    },
    ({
      dryRun,
      indexPrefix,
      installContentSearchApp,
      locales,
      ...destinationFlags
    }) => {
      const provisionProgram = Effect.gen(function* () {
        const requestedIndexPrefix = Option.getOrUndefined(indexPrefix);
        const resolvedConfigProvider = yield* configProvider;
        const resolvedConfigProviderEffect = Effect.succeed(
          resolvedConfigProvider
        );
        const contentProjection = yield* composition.content.createProjection(
          contentIndexName(requestedIndexPrefix),
          resolvedConfigProviderEffect
        );

        if (dryRun) {
          const plan = yield* formatAlgoliaProvisioningPlan(
            requestedIndexPrefix,
            locales,
            contentProjection
          );
          yield* Console.log(plan);
          if (installContentSearchApp) {
            yield* Console.log(
              `  Content search app installation: Contentstack Algolia app -> "${contentIndexName(requestedIndexPrefix)}"`
            );
          }
          return {
            contentSearchApp: undefined,
            receipt: undefined,
          } satisfies SearchProvisionResult;
        }

        const provisioningLayer = createSearchProvisioningLayer(
          resolvedConfigProviderEffect
        );
        const commerceConnectorSource = yield* composition.commerce.create(
          resolvedConfigProviderEffect
        );
        const receipt = yield* provisionAlgolia({
          commerceConnectorSource,
          contentProjection,
          destination: runtimeEnvironmentDestinationFromFlags(destinationFlags),
          indexPrefix: requestedIndexPrefix,
          locales,
        }).pipe(Effect.provide(provisioningLayer));

        if (!installContentSearchApp) {
          return {
            contentSearchApp: undefined,
            receipt,
          } satisfies SearchProvisionResult;
        }

        const installHook = yield* requireContentSearchAppHook(
          composition.content.installContentSearchApp
        );
        const contentSearchApp = yield* installHook(
          { indexName: contentIndexName(receipt.indexPrefix) },
          resolvedConfigProviderEffect
        );
        return {
          contentSearchApp,
          receipt,
        } satisfies SearchProvisionResult;
      });

      return asUserError(provisionProgram).pipe(
        Effect.flatMap(({ contentSearchApp, receipt }) =>
          receipt === undefined
            ? Effect.void
            : Console.log("✓ Algolia search provisioned").pipe(
                Effect.andThen(
                  Console.log(
                    `  Index prefix: ${receipt.indexPrefix ?? "none"}`
                  )
                ),
                Effect.andThen(
                  Console.log(
                    `  Products: ${receipt.productPrimaries} primaries, ${receipt.productReplicas} replicas`
                  )
                ),
                Effect.andThen(
                  Console.log(`  Content: ${receipt.contentIndices} indices`)
                ),
                Effect.andThen(
                  Console.log(
                    `  Query Suggestions: ${receipt.querySuggestions} configurations`
                  )
                ),
                Effect.andThen(
                  Console.log(
                    `  Commerce connectors: ${receipt.connectors} configured, ${receipt.initialReindexes} initial reindexes completed`
                  )
                ),
                Effect.andThen(
                  contentSearchApp === undefined
                    ? Console.log(
                        formatContentIndexingHandoff(
                          composition.content.createIndexingHandoff(
                            contentIndexName(receipt.indexPrefix)
                          )
                        )
                      )
                    : Console.log(
                        `  Content search app: ${contentSearchApp.status} installation ${contentSearchApp.installationUid} for "${contentSearchApp.indexName}" (${contentSearchApp.environment})`
                      )
                )
              )
        )
      );
    }
  ).pipe(
    Command.withDescription(
      "Provision Store and locale search resources and runtime credentials"
    )
  );

  const generateTypes = Command.make("generate", {}, () =>
    asUserError(
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
              schemaDirectory: composition.commerce.productTypeSchemaDirectory,
            }),
            generateAlgoliaCommercetoolsTransformation({
              outputFile: GENERATED_CONNECTOR_TRANSFORMATION_FILE,
              sourceFile: CONNECTOR_TRANSFORMATION_SOURCE_FILE,
            }),
          ]);
        },
      })
    ).pipe(
      Effect.andThen(
        Console.log(
          "Generated schema-backed Algolia commercetools Product types and transformation"
        )
      )
    )
  ).pipe(
    Command.withDescription(
      "Generate Algolia connector types from commerce Product Type schemas"
    )
  );
  const types = Command.make("types", {}, () => Effect.void).pipe(
    Command.withDescription("Search connector type-generation commands"),
    Command.withSubcommands([generateTypes])
  );

  return Command.make("search", {}, () => Effect.void).pipe(
    Command.withDescription("Search provider administration commands"),
    Command.withSubcommands([provision, types])
  );
};
