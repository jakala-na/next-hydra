/* oxlint-disable no-console -- CLI commands write user-facing output. */

import { fileURLToPath } from "node:url";

import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";

import { createCommercetoolsClient } from "../client";
import type { CommerceCliEnvironmentProvider } from "../environment";
import { createMigration } from "../migration-generator";
import {
  getAppliedMigrations,
  getPendingMigrations,
  loadMigrations,
  recordMigration,
} from "../migrations";

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../migrations/scripts", import.meta.url)
);

type MigrateOptions = {
  readonly dryRun?: boolean;
};

const pendingMigrations = async (apiRoot: ByProjectKeyRequestBuilder) => {
  const migrations = await loadMigrations(MIGRATIONS_DIRECTORY);
  const applied = await getAppliedMigrations(apiRoot);

  return {
    applied,
    migrations,
    pending: getPendingMigrations(migrations, applied),
  };
};

const printPendingMigrations = (
  pending: readonly {
    readonly description: string;
    readonly fileName: string;
  }[]
) => {
  for (const migration of pending) {
    console.log(`  - ${migration.fileName}`);
    console.log(`    ${chalk.dim(migration.description)}`);
  }
};

export const createMigrateCommand = (
  environment: CommerceCliEnvironmentProvider
): Command => {
  const migrateCommand = new Command("migrate")
    .description("Apply pending Commercetools schema migrations")
    .option("--dry-run", "Show pending migrations without applying them")
    .action(async (options: MigrateOptions) => {
      const spinner = ora("Loading migrations").start();

      try {
        const apiRoot = createCommercetoolsClient(environment());
        const result = await pendingMigrations(apiRoot);
        spinner.stop();

        if (result.pending.length === 0) {
          console.log(chalk.green("✓ No pending migrations"));
          return;
        }

        console.log(
          chalk.yellow(`${result.pending.length} pending migration(s):`)
        );
        printPendingMigrations(result.pending);

        if (options.dryRun) {
          console.log(chalk.blue("\n[DRY RUN] No migrations were applied"));
          return;
        }

        for (const migration of result.pending) {
          spinner.start(`Applying ${migration.fileName}`);
          await migration.up(apiRoot);
          await recordMigration(apiRoot, migration.key);
          spinner.succeed(`Applied ${migration.fileName}`);
        }
      } catch (error) {
        spinner.fail("Migration failed");
        console.error(error);
        process.exitCode = 1;
      }
    });

  migrateCommand
    .command("status")
    .description("Show applied and pending migrations")
    .action(async () => {
      const spinner = ora("Loading migration status").start();

      try {
        const result = await pendingMigrations(
          createCommercetoolsClient(environment())
        );
        spinner.stop();

        console.log(chalk.blue("Migration status:"));
        console.log(`  Total: ${result.migrations.length}`);
        console.log(`  Applied: ${result.applied.length}`);
        console.log(`  Pending: ${result.pending.length}`);

        if (result.pending.length > 0) {
          console.log(chalk.yellow("\nPending migrations:"));
          printPendingMigrations(result.pending);
        }
      } catch (error) {
        spinner.fail("Failed to load migration status");
        console.error(error);
        process.exitCode = 1;
      }
    });

  migrateCommand
    .command("plan")
    .description("Show pending migrations without applying them")
    .action(async () => {
      const spinner = ora("Planning migrations").start();

      try {
        const result = await pendingMigrations(
          createCommercetoolsClient(environment())
        );
        spinner.stop();

        if (result.pending.length === 0) {
          console.log(chalk.green("✓ No pending migrations"));
          return;
        }

        console.log(
          chalk.blue(`Would apply ${result.pending.length} migration(s):`)
        );
        printPendingMigrations(result.pending);
      } catch (error) {
        spinner.fail("Failed to plan migrations");
        console.error(error);
        process.exitCode = 1;
      }
    });

  migrateCommand
    .command("create <name>")
    .description("Create a timestamped migration file")
    .option("-d, --description <description>", "Migration description")
    .action(
      async (name: string, options: { readonly description?: string }) => {
        const spinner = ora("Creating migration").start();

        try {
          const fileName = await createMigration(
            MIGRATIONS_DIRECTORY,
            name,
            options.description ?? `Migration: ${name}`
          );
          spinner.succeed(`Created ${fileName}`);
        } catch (error) {
          spinner.fail("Failed to create migration");
          console.error(error);
          process.exitCode = 1;
        }
      }
    );

  return migrateCommand;
};
