/* oxlint-disable no-await-in-loop -- Contentstack migrations are ordered and must be applied serially. */

import { Array as EffectArray, Effect, FileSystem, Order, Path } from "effect";

import { ContentstackCli } from "../provisioning/contentstack-cli";
import { requireSupportedContentstackCliVersion } from "../provisioning/require-cli-version";
import { ContentstackMigrationLedger } from "./ledger";
import {
  ContentstackMigration,
  ContentstackMigrationDiscoveryError,
  ContentstackMigrationReceipt,
  ContentstackMigrationState,
} from "./model";
import type { ContentstackMigrationTarget } from "./model";

const MIGRATION_FILE_PATTERN =
  /^\d{4}-\d{2}-\d{2}-\d{6}-[a-z0-9]+(?:-[a-z0-9]+)*\.js$/u;

const discoveryError = (message: string, cause: unknown) =>
  new ContentstackMigrationDiscoveryError({ cause, message });

const migrationsDirectory = Effect.fn("ContentstackMigrations.directory")(
  function* () {
    const path = yield* Path.Path;
    return yield* path
      .fromFileUrl(new URL("../../migrations/", import.meta.url))
      .pipe(
        Effect.mapError((cause) =>
          discoveryError(
            "Could not locate the checked-in Contentstack migrations",
            cause
          )
        )
      );
  }
);

export const discoverContentstackMigrations = Effect.fn(
  "ContentstackMigrations.discover"
)(function* (directory: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = yield* fileSystem
    .readDirectory(directory)
    .pipe(
      Effect.mapError((cause) =>
        discoveryError("Could not read the Contentstack migrations", cause)
      )
    );
  const invalidMigration = entries.find(
    (entry) => entry.endsWith(".js") && !MIGRATION_FILE_PATTERN.test(entry)
  );

  if (invalidMigration !== undefined) {
    return yield* discoveryError(
      "Contentstack migration filenames must be timestamped and kebab-cased",
      new Error(`Invalid Contentstack migration filename ${invalidMigration}`)
    );
  }

  // oxlint-disable-next-line unicorn/no-array-sort -- Effect Array.sort is immutable; the rule mistakes it for the native mutating method.
  return EffectArray.sort(Order.String)(
    entries.filter((entry) => MIGRATION_FILE_PATTERN.test(entry))
  ).map(
    (fileName) =>
      new ContentstackMigration({
        file: path.join(directory, fileName),
        fileName,
        key: fileName.slice(0, -".js".length),
      })
  );
});

const loadState = Effect.fn("ContentstackMigrations.loadState")(function* (
  target: ContentstackMigrationTarget
) {
  const directory = yield* migrationsDirectory();
  const migrations = yield* discoverContentstackMigrations(directory);
  const ledger = yield* ContentstackMigrationLedger;
  const store = yield* ledger.open(target);
  const applied = yield* store.applied();
  const appliedKeys = new Set(applied.map((migration) => migration.key));
  const pending = migrations.filter(
    (migration) => !appliedKeys.has(migration.key)
  );

  return {
    state: new ContentstackMigrationState({
      applied: [...applied],
      migrations,
      pending,
    }),
    store,
  };
});

export const resolveContentstackMigrationTarget = Effect.fn(
  "ContentstackMigrations.resolveTarget"
)(function* (managementTokenAlias: string) {
  const cli = yield* ContentstackCli;

  yield* requireSupportedContentstackCliVersion();
  const endpoints = yield* cli.runtimeEndpoints();
  const stack = yield* cli.resolveStack(managementTokenAlias);

  return {
    region: endpoints.region,
    stack,
  } satisfies ContentstackMigrationTarget;
});

export const getContentstackMigrationState = Effect.fn(
  "ContentstackMigrations.state"
)(function* (managementTokenAlias: string) {
  const target =
    yield* resolveContentstackMigrationTarget(managementTokenAlias);
  const { state } = yield* loadState(target);
  return state;
});

export const applyContentstackMigrations = Effect.fn(
  "ContentstackMigrations.apply"
)(function* (target: ContentstackMigrationTarget) {
  const cli = yield* ContentstackCli;
  const { state, store } = yield* loadState(target);
  const applied: ContentstackMigration[] = [];

  for (const migration of state.pending) {
    yield* cli.runMigration({
      file: migration.file,
      managementTokenAlias: target.stack.managementTokenAlias,
    });
    yield* store.record(migration);
    applied.push(migration);
  }

  return new ContentstackMigrationReceipt({ applied });
});

export const migrateContentstack = Effect.fn("ContentstackMigrations.migrate")(
  function* (managementTokenAlias: string) {
    const target =
      yield* resolveContentstackMigrationTarget(managementTokenAlias);
    return yield* applyContentstackMigrations(target);
  }
);
