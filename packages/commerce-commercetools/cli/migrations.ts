import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";

const MIGRATIONS_CONTAINER = "schema-migrations";
const MIGRATION_EXTENSION = /\.ts$/;
const PAGE_SIZE = 500;

export type Migration = {
  readonly name: string;
  readonly description: string;
  readonly fileName: string;
  readonly key: string;
  readonly up: (apiRoot: ByProjectKeyRequestBuilder) => Promise<void>;
};

export type AppliedMigration = {
  readonly appliedAt: string;
  readonly appliedBy?: string;
  readonly key: string;
  readonly version: number;
};

type LoadedMigrationDefinition = Omit<Migration, "fileName" | "key">;

const isLoadedMigrationDefinition = (
  value: unknown
): value is LoadedMigrationDefinition =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  typeof value.name === "string" &&
  "description" in value &&
  typeof value.description === "string" &&
  "up" in value &&
  typeof value.up === "function";

export const loadMigrations = async (
  migrationsDirectory: string
): Promise<Migration[]> => {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".ts"))
    .sort();
  const migrations: Migration[] = [];

  for (const fileName of files) {
    const module = (await import(
      pathToFileURL(join(migrationsDirectory, fileName)).href
    )) as { readonly migration?: unknown };

    if (!isLoadedMigrationDefinition(module.migration)) {
      throw new Error(
        `Migration "${fileName}" must export a migration definition`
      );
    }

    migrations.push({
      ...module.migration,
      fileName,
      key: fileName.replace(MIGRATION_EXTENSION, ""),
    });
  }

  return migrations;
};

export const getAppliedMigrations = async (
  apiRoot: ByProjectKeyRequestBuilder
): Promise<AppliedMigration[]> => {
  const applied: AppliedMigration[] = [];
  let offset = 0;

  while (true) {
    const response = await apiRoot
      .customObjects()
      .withContainer({ container: MIGRATIONS_CONTAINER })
      .get({
        queryArgs: {
          limit: PAGE_SIZE,
          offset,
          sort: "key asc",
        },
      })
      .execute();

    for (const customObject of response.body.results) {
      const value = customObject.value as {
        readonly appliedAt?: unknown;
        readonly appliedBy?: unknown;
        readonly version?: unknown;
      };

      if (typeof value.appliedAt !== "string") {
        throw new Error(
          `Migration record "${customObject.key}" has no appliedAt timestamp`
        );
      }

      applied.push({
        key: customObject.key,
        appliedAt: value.appliedAt,
        ...(typeof value.appliedBy === "string"
          ? { appliedBy: value.appliedBy }
          : {}),
        version: typeof value.version === "number" ? value.version : 1,
      });
    }

    if (response.body.results.length < PAGE_SIZE) {
      return applied;
    }

    offset += PAGE_SIZE;
  }
};

export const getPendingMigrations = (
  allMigrations: readonly Migration[],
  appliedMigrations: readonly AppliedMigration[]
): Migration[] => {
  const appliedKeys = new Set(
    appliedMigrations.map((migration) => migration.key)
  );
  return allMigrations.filter((migration) => !appliedKeys.has(migration.key));
};

export const recordMigration = async (
  apiRoot: ByProjectKeyRequestBuilder,
  migrationKey: string
): Promise<void> => {
  await apiRoot
    .customObjects()
    .post({
      body: {
        container: MIGRATIONS_CONTAINER,
        key: migrationKey,
        value: {
          appliedAt: new Date().toISOString(),
          appliedBy: "cli",
          version: 1,
        },
      },
    })
    .execute();
};
