import {
  runtimeEnvironmentDestinationFlags,
  runtimeEnvironmentDestinationFromFlags,
} from "@repo/cli-core/runtime-environment-cli";
import type { InstalledContentSearchApp } from "@repo/search/content-search-app";
import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import type { ConfigProvider, Effect as EffectType } from "effect";
import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { contentIndexName } from "../index-graph";
import type { StoreConfiguration } from "../index-graph";
import type { ContentIndexingHandoff } from "./content-indexing-handoff";
import { formatContentIndexingHandoff } from "./content-indexing-handoff";
import type { ContentSearchAppHook } from "./content-search-app-hook";
import { requireContentSearchAppHook } from "./content-search-app-hook";
import { searchCliError } from "./error-message";
import { createSearchProvisioningLayer } from "./layer";
import type { AlgoliaProvisioningReceipt } from "./provisioning/model";
import { formatAlgoliaProvisioningPlan } from "./provisioning/plan";
import type { ProvisionAlgoliaOptions } from "./provisioning/provision";
import { provisionAlgolia } from "./provisioning/provision";

export interface SearchCliComposition<CommerceError, ContentError> {
  readonly products?: {
    readonly storefronts: StoreConfiguration;
    readonly prepare: (
      provider: EffectType.Effect<ConfigProvider.ConfigProvider>
    ) => EffectType.Effect<
      NonNullable<ProvisionAlgoliaOptions["products"]>,
      CommerceError
    >;
    readonly generateTypes: () => EffectType.Effect<void, CommerceError>;
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
      dryRun: Flag.Boolean("dry-run").pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          "Print the selected locale search resources without changing Algolia"
        )
      ),
      indexPrefix: Flag.String("index-prefix").pipe(
        Flag.withDescription(
          "Optional namespace prepended to every managed Algolia index"
        ),
        Flag.optional
      ),
      installContentSearchApp: Flag.Boolean("install-content-search-app").pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          "Install and configure the composed CMS provider's content search app for the provisioned Content index (Contentstack only)"
        )
      ),
      locales: Flag.String("locale").pipe(
        Flag.withDescription(
          "Locale to provision; repeat for every deployment locale"
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
        if (installContentSearchApp) {
          yield* requireContentSearchAppHook(
            composition.content.installContentSearchApp
          );
        }
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
            contentProjection,
            composition.products?.storefronts
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
        const products =
          composition.products === undefined
            ? undefined
            : yield* composition.products.prepare(resolvedConfigProviderEffect);
        const receipt = yield* provisionAlgolia({
          contentProjection,
          destination: runtimeEnvironmentDestinationFromFlags(destinationFlags),
          indexPrefix: requestedIndexPrefix,
          locales,
          products,
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
                  composition.products === undefined
                    ? Effect.void
                    : Console.log(
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
                  composition.products === undefined
                    ? Effect.void
                    : Console.log(
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
      "Provision selected search resources and runtime credentials"
    )
  );

  const generate = composition.products?.generateTypes;
  const additionalCommands =
    generate === undefined
      ? []
      : [
          Command.make("types", {}, () => Effect.void).pipe(
            Command.withDescription(
              "Search connector type-generation commands"
            ),
            Command.withSubcommands([
              Command.make("generate", {}, () =>
                asUserError(generate()).pipe(
                  Effect.andThen(
                    Console.log(
                      "Generated schema-backed Product types and transformation"
                    )
                  )
                )
              ),
            ])
          ),
        ];

  return Command.make("search", {}, () => Effect.void).pipe(
    Command.withDescription("Search provider administration commands"),
    Command.withSubcommands([provision, ...additionalCommands])
  );
};
