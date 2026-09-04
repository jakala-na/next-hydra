import type { ConfigProvider, Effect as EffectType } from "effect";
import {
  ConfigProvider as ConfigProviderValue,
  Console,
  Effect,
  Layer,
} from "effect";
import { CliError, Command, Flag } from "effect/unstable/cli";

import {
  ContentfulMigrationRunner,
  migrateContentfulStarterModel,
  resolveContentfulMigrationTarget,
} from "./migrations/migrate";

const asUserError = <A, E, R>(effect: EffectType.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError((cause) => new CliError.UserError({ cause })));

export const createCmsCommand = <E, R>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) => {
  const provision = Command.make("provision", {}, () =>
    Effect.fail(
      new CliError.UserError({
        cause: new Error(
          "Contentful space provisioning is not implemented. Configure the CONTENTFUL_* variables in packages/cms-contentful/.env.example."
        ),
      })
    )
  ).pipe(
    Command.withDescription(
      "Provision a Contentful space (not implemented in this scaffold)"
    )
  );

  const migrate = Command.make(
    "migrate",
    {
      environmentId: Flag.string("environment").pipe(
        Flag.withDescription(
          "Contentful environment ID (defaults to CONTENTFUL_ENVIRONMENT or master)"
        ),
        Flag.optional
      ),
      managementToken: Flag.string("management-token").pipe(
        Flag.withDescription(
          "Contentful management API token (defaults to CONTENTFUL_MANAGEMENT_TOKEN)"
        ),
        Flag.optional
      ),
      spaceId: Flag.string("space-id").pipe(
        Flag.withDescription(
          "Contentful space ID (defaults to CONTENTFUL_SPACE_ID)"
        ),
        Flag.optional
      ),
    },
    ({ environmentId, managementToken, spaceId }) =>
      asUserError(
        Effect.gen(function* () {
          const target = yield* resolveContentfulMigrationTarget({
            environmentId,
            managementToken,
            spaceId,
          });
          yield* migrateContentfulStarterModel(target);
          yield* Console.log("✓ Applied the Contentful starter content model");
        })
      )
  ).pipe(
    Command.withDescription(
      "Create the starter Contentful content model in an empty environment"
    ),
    Command.provide(
      Layer.mergeAll(
        ConfigProviderValue.layer(configProvider),
        ContentfulMigrationRunner.layerLive
      )
    )
  );

  return Command.make("cms", {}, () => Effect.void).pipe(
    Command.withDescription("Contentful CMS administration commands"),
    Command.withSubcommands([migrate, provision])
  );
};
