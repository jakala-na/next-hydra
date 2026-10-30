import {
  phase,
  renderReport,
  withCommandOutput,
} from "@repo/cli-core/command-output";
import { runtimeEnvironmentReceiptDescription } from "@repo/cli-core/runtime-environment";
import {
  runtimeEnvironmentDestinationFlags,
  runtimeEnvironmentDestinationFromFlags,
} from "@repo/cli-core/runtime-environment-cli";
import type { ContentIndexingOperation } from "@repo/search/content-indexing";
import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import type { ConfigProvider, Effect as EffectType } from "effect";
import { Cause, Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { contentIndexName } from "../index-graph";
import type { StoreConfiguration } from "../index-graph";
import type {
  ContentIndexingHandoff,
  ContentIndexingHandoffContext,
} from "./content-indexing-handoff";
import type { ContentSearchAppHook } from "./content-search-app-hook";
import {
  contentSearchAppConfigProvider,
  requireContentSearchAppHook,
} from "./content-search-app-hook";
import { searchCliError } from "./error-message";
import { createSearchProvisioningLayer } from "./layer";
import { searchOutput, searchProvisioningReport } from "./output";
import { createAlgoliaProvisioningPlan } from "./provisioning/plan";
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
    readonly indexingOperations: readonly ContentIndexingOperation[];
    readonly createIndexingHandoff: (
      indexName: string,
      context: ContentIndexingHandoffContext
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
  effect.pipe(
    Effect.catchCause(
      (
        cause
      ): EffectType.Effect<never, E | ReturnType<typeof searchCliError>> =>
        Cause.hasInterrupts(cause)
          ? Effect.failCause(cause)
          : Effect.fail(searchCliError(cause))
    )
  );

export const createSearchCommand = <E, R, CommerceError, ContentError>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>,
  composition: SearchCliComposition<CommerceError, ContentError>
) => {
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
      const requestedIndexPrefix = Option.getOrUndefined(indexPrefix);
      return withCommandOutput(
        {
          title: searchOutput.title,
          context: `Algolia · ${locales.join(", ")} · index prefix ${requestedIndexPrefix ?? "none"}`,
          failureNote: searchOutput.failureNote,
        },
        (style) => {
          const provisionProgram = Effect.gen(function* () {
            if (installContentSearchApp) {
              yield* requireContentSearchAppHook(
                composition.content.installContentSearchApp
              );
            }
            const resolvedConfigProvider = yield* configProvider;
            const provider = Effect.succeed(resolvedConfigProvider);
            const contentProjection = yield* phase(
              searchOutput.projection,
              composition.content.createProjection(
                contentIndexName(requestedIndexPrefix),
                provider
              )
            );

            if (dryRun) {
              const plan = yield* createAlgoliaProvisioningPlan(
                requestedIndexPrefix,
                locales,
                contentProjection,
                composition.products?.storefronts
              );
              yield* Console.log(
                renderReport(
                  {
                    ...plan,
                    sections: [
                      ...plan.sections,
                      {
                        title: "Publication",
                        facts: [
                          {
                            label: "Destination",
                            value: destinationFlags.store,
                          },
                          {
                            label: "Content write operations",
                            value:
                              composition.content.indexingOperations.join(", "),
                          },
                          {
                            label: "CMS app installation",
                            value: installContentSearchApp
                              ? "Requested for the selected CMS provider"
                              : "Manual setup",
                          },
                        ],
                      },
                    ],
                  },
                  style
                )
              );
              return;
            }

            const products =
              composition.products === undefined
                ? undefined
                : yield* phase(
                    searchOutput.commerce,
                    composition.products.prepare(provider)
                  );
            const provisioning = yield* provisionAlgolia({
              contentIndexingOperations: composition.content.indexingOperations,
              contentProjection,
              destination:
                runtimeEnvironmentDestinationFromFlags(destinationFlags),
              indexPrefix: requestedIndexPrefix,
              locales,
              products,
            }).pipe(Effect.provide(createSearchProvisioningLayer(provider)));
            let contentSearchApp;
            if (installContentSearchApp) {
              const installHook = yield* requireContentSearchAppHook(
                composition.content.installContentSearchApp
              );
              contentSearchApp = yield* phase(
                searchOutput.app,
                installHook(
                  {
                    indexName: contentIndexName(
                      provisioning.receipt.indexPrefix
                    ),
                  },
                  Effect.succeed(
                    contentSearchAppConfigProvider(
                      provisioning.contentCredentials,
                      resolvedConfigProvider
                    )
                  )
                )
              );
            }
            const contentHandoff = composition.content.createIndexingHandoff(
              contentIndexName(provisioning.receipt.indexPrefix),
              {
                appInstalled: contentSearchApp !== undefined,
                credentialsLocation: runtimeEnvironmentReceiptDescription(
                  provisioning.publication
                ),
                ...(contentSearchApp?.configuredMappings === undefined
                  ? {}
                  : {
                      configuredMappings: contentSearchApp.configuredMappings,
                    }),
              }
            );
            yield* Console.log(
              renderReport(
                searchProvisioningReport({
                  receipt: provisioning.receipt,
                  publication: provisioning.publication,
                  runtimeEnvironment: provisioning.runtimeEnvironment,
                  contentIndexNames: provisioning.contentIndexNames,
                  contentSearchApp,
                  contentHandoff,
                  hasCommerce: composition.products !== undefined,
                }),
                style
              )
            );
          });
          return asUserError(provisionProgram);
        }
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
