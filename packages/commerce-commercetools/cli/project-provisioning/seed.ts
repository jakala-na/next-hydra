/* oxlint-disable no-await-in-loop -- Migrations are ordered and must be applied serially. */

import { fileURLToPath } from "node:url";

import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { Effect } from "effect";

import { CommercetoolsRestClient } from "../../client/rest-client";
import {
  getAppliedMigrations,
  getPendingMigrations,
  loadMigrations,
  recordMigration,
} from "../migrations";
import { ProjectSeedReceipt, RuntimeProjectSetupError } from "./model";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../migrations/scripts", import.meta.url)
);

const applyPendingMigrations = async (
  apiRoot: ByProjectKeyRequestBuilder
): Promise<number> => {
  const migrations = await loadMigrations(MIGRATIONS_DIRECTORY);
  const applied = await getAppliedMigrations(apiRoot);
  const pending = getPendingMigrations(migrations, applied);

  for (const migration of pending) {
    await migration.up(apiRoot);
    await recordMigration(apiRoot, migration.key);
  }

  return pending.length;
};

export const seedCommerceProject = Effect.fn("seedCommerceProject")(
  function* () {
    const { apiRoot } = yield* CommercetoolsRestClient;
    const migrationsApplied = yield* Effect.tryPromise({
      catch: (cause) =>
        new RuntimeProjectSetupError({
          cause,
          message: "Could not apply the starter-kit migrations",
          phase: "migrations",
        }),
      try: async () => await applyPendingMigrations(apiRoot),
    });

    return new ProjectSeedReceipt({ migrationsApplied });
  }
);
