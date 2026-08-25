import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Redacted } from "effect";

import { ContentstackCli } from "../provisioning/contentstack-cli";
import { CONTENTSTACK_CLI_VERSION } from "../provisioning/contentstack-cli-live";
import {
  ContentstackApiKey,
  ContentstackCliError,
  ContentstackRuntimeEndpoints,
  ContentstackStack,
} from "../provisioning/model";
import { ContentstackMigrationLedger } from "./ledger";
import {
  applyContentstackMigrations,
  discoverContentstackMigrations,
  getContentstackMigrationState,
} from "./migrate";
import {
  AppliedContentstackMigration,
  ContentstackMigrationDiscoveryError,
} from "./model";

const migrationKey = "2026-08-23-120000-add-landing-page-seo-fields";
const stack = new ContentstackStack({
  apiKey: ContentstackApiKey.make("blt-api-key"),
  managementToken: Redacted.make("management-token"),
  managementTokenAlias: "next-hydra-bootstrap",
});
const endpoints = new ContentstackRuntimeEndpoints({
  graphqlHost: "graphql.contentstack.com",
  graphqlPreviewHost: "graphql-preview.contentstack.com",
  region: "NA",
});
const target = { region: endpoints.region, stack } as const;

const layersFor = (options?: {
  readonly applied?: readonly AppliedContentstackMigration[];
  readonly failMigration?: boolean;
}) => {
  const events: string[] = [];
  const records: string[] = [];

  return {
    events,
    layer: Layer.mergeAll(
      ContentstackCli.layerFrom({
        importRecipe: () => Effect.void,
        resolveStack: (alias) =>
          Effect.sync(() => {
            events.push(`resolve:${alias}`);
            return stack;
          }),
        runMigration: ({ file }) =>
          Effect.gen(function* () {
            events.push(`run:${file}`);
            if (options?.failMigration) {
              return yield* new ContentstackCliError({
                cause: new Error("migration failed"),
                message: "Contentstack migration failed",
                operation: "migrate",
              });
            }

            return yield* Effect.void;
          }),
        runtimeEndpoints: () =>
          Effect.sync(() => {
            events.push("region");
            return endpoints;
          }),
        version: () =>
          Effect.sync(() => {
            events.push("version");
            return `@contentstack/cli/${CONTENTSTACK_CLI_VERSION} test-platform node-test`;
          }),
      }),
      ContentstackMigrationLedger.layerFrom({
        open: () =>
          Effect.succeed({
            applied: () => Effect.succeed(options?.applied ?? []),
            record: (migration) =>
              Effect.sync(() => {
                records.push(migration.key);
                events.push(`record:${migration.key}`);
              }),
          }),
      }),
      NodeServices.layer
    ),
    records,
  };
};

describe("Contentstack migrations", () => {
  it.effect("discovers timestamped migrations in lexical order", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "next-hydra-contentstack-migrations-",
        });

        yield* fileSystem.writeFileString(
          path.join(directory, "2026-08-23-120002-second.js"),
          ""
        );
        yield* fileSystem.writeFileString(
          path.join(directory, "2026-08-23-120001-first.js"),
          ""
        );
        yield* fileSystem.writeFileString(
          path.join(directory, "README.md"),
          "ignored"
        );

        const migrations = yield* discoverContentstackMigrations(directory);

        expect(migrations.map((migration) => migration.fileName)).toStrictEqual(
          ["2026-08-23-120001-first.js", "2026-08-23-120002-second.js"]
        );
      }).pipe(Effect.provide(NodeServices.layer))
    )
  );

  it.effect(
    "rejects JavaScript files outside the migration naming contract",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const directory = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "next-hydra-contentstack-migrations-",
          });

          yield* fileSystem.writeFileString(
            path.join(directory, "migration.js"),
            ""
          );

          const error = yield* discoverContentstackMigrations(directory).pipe(
            Effect.flip
          );

          expect(error).toBeInstanceOf(ContentstackMigrationDiscoveryError);
        }).pipe(Effect.provide(NodeServices.layer))
      )
  );

  it.effect("runs each pending file before recording it", () => {
    const test = layersFor();

    return Effect.gen(function* () {
      const receipt = yield* applyContentstackMigrations(target).pipe(
        Effect.provide(test.layer)
      );

      expect(receipt.applied.map((migration) => migration.key)).toStrictEqual([
        migrationKey,
      ]);
      expect(test.records).toStrictEqual([migrationKey]);
      expect(test.events[0]).toMatch(/run:.*seo-fields\.js$/u);
      expect(test.events[1]).toBe(`record:${migrationKey}`);
    });
  });

  it.effect("skips migrations already present in the stack ledger", () => {
    const test = layersFor({
      applied: [
        new AppliedContentstackMigration({
          appliedAt: "2026-08-23T12:00:00.000Z",
          appliedBy: "next-hydra-cli",
          key: migrationKey,
          version: 1,
        }),
      ],
    });

    return Effect.gen(function* () {
      const receipt = yield* applyContentstackMigrations(target).pipe(
        Effect.provide(test.layer)
      );

      expect(receipt.applied).toHaveLength(0);
      expect(test.events).toStrictEqual([]);
      expect(test.records).toStrictEqual([]);
    });
  });

  it.effect("does not record a migration when CSDX fails", () => {
    const test = layersFor({ failMigration: true });

    return Effect.gen(function* () {
      const error = yield* applyContentstackMigrations(target).pipe(
        Effect.provide(test.layer),
        Effect.flip
      );

      expect(error).toBeInstanceOf(ContentstackCliError);
      expect(test.records).toStrictEqual([]);
    });
  });

  it.effect(
    "resolves the CLI version, region, and token alias for status",
    () => {
      const test = layersFor();

      return Effect.gen(function* () {
        const state = yield* getContentstackMigrationState(
          stack.managementTokenAlias
        ).pipe(Effect.provide(test.layer));

        expect(state.pending.map((migration) => migration.key)).toStrictEqual([
          migrationKey,
        ]);
        expect(test.events).toStrictEqual([
          "version",
          "region",
          "resolve:next-hydra-bootstrap",
        ]);
      });
    }
  );
});
