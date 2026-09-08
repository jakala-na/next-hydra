/* oxlint-disable unicorn/throw-new-error -- Schema.TaggedError is the Effect error-class factory. */

import type { RunMigrationConfig } from "contentful-migration";
import { runMigration } from "contentful-migration";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

import { createStarterContentModel } from "../../migrations/starter-content-model";
import { ContentfulMigrationError, ContentfulMigrationTarget } from "./model";

const optionOrConfig = (value: Option.Option<string>, name: string) =>
  Option.match(value, {
    onNone: () => Config.nonEmptyString(name),
    onSome: (provided) => Effect.succeed(provided),
  });

export const resolveContentfulMigrationTarget = (input: {
  readonly environmentId: Option.Option<string>;
  readonly managementToken: Option.Option<string>;
  readonly spaceId: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const spaceId = yield* optionOrConfig(input.spaceId, "CONTENTFUL_SPACE_ID");
    const environmentId = yield* Option.match(input.environmentId, {
      onNone: () =>
        Config.nonEmptyString("CONTENTFUL_ENVIRONMENT").pipe(
          Config.withDefault("master")
        ),
      onSome: (provided) => Effect.succeed(provided),
    });
    const accessToken = yield* Option.match(input.managementToken, {
      onNone: () => Config.redacted("CONTENTFUL_MANAGEMENT_TOKEN"),
      onSome: (provided) => Effect.succeed(Redacted.make(provided)),
    });

    return new ContentfulMigrationTarget({
      accessToken,
      environmentId,
      spaceId,
    });
  });

export class ContentfulMigrationRunner extends Context.Service<
  ContentfulMigrationRunner,
  {
    readonly runStarterModel: (
      target: ContentfulMigrationTarget
    ) => Effect.Effect<void, ContentfulMigrationError>;
  }
>()("@repo/cms-contentful/ContentfulMigrationRunner") {
  static readonly layerFrom = (
    run: (config: RunMigrationConfig) => Promise<void>
  ) =>
    Layer.succeed(
      ContentfulMigrationRunner,
      ContentfulMigrationRunner.of({
        runStarterModel: (target) =>
          Effect.tryPromise({
            catch: (cause) =>
              new ContentfulMigrationError({
                cause,
                message: "Could not apply the Contentful starter content model",
              }),
            try: async () => {
              await run({
                accessToken: Redacted.value(target.accessToken),
                environmentId: target.environmentId,
                migrationFunction: createStarterContentModel,
                spaceId: target.spaceId,
                yes: true,
              });
            },
          }),
      })
    );

  static readonly layerLive = ContentfulMigrationRunner.layerFrom(
    async (config) => {
      await runMigration(config);
    }
  );
}

export const migrateContentfulStarterModel = Effect.fn(
  "ContentfulMigrations.applyStarterModel"
)(function* (target: ContentfulMigrationTarget) {
  const runner = yield* ContentfulMigrationRunner;
  yield* runner.runStarterModel(target);
});
