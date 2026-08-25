/* oxlint-disable no-await-in-loop -- Migrations are ordered and must be applied serially. */

import { fileURLToPath } from "node:url";

import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import chalk from "chalk";
import { Console, Effect, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";
import ora from "ora";
import type { Ora } from "ora";

import { CommercetoolsRestClient } from "../../client/rest-client";
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
) =>
  Effect.forEach(
    pending,
    (migration) =>
      Console.log(`  - ${migration.fileName}`).pipe(
        Effect.andThen(Console.log(`    ${chalk.dim(migration.description)}`))
      ),
    { discard: true }
  );

const tryCommandPromise = <A>(
  spinner: Ora,
  failureMessage: string,
  evaluate: () => Promise<A>
) =>
  Effect.tryPromise({
    catch: (cause) => {
      spinner.fail(failureMessage);
      return new CliError.UserError({ cause });
    },
    try: evaluate,
  });

// oxlint-disable-next-line max-lines-per-function -- Keeps the command tree and its handlers discoverable together.
export const createMigrateCommand = () => {
  const migrate = Command.make(
    "migrate",
    {
      dryRun: Flag.boolean("dry-run").pipe(
        Flag.withDescription("Show pending migrations without applying them"),
        Flag.withDefault(false)
      ),
    },
    ({ dryRun }) =>
      Effect.gen(function* () {
        const { apiRoot } = yield* CommercetoolsRestClient;
        const spinner = ora("Loading migrations").start();

        const result = yield* tryCommandPromise(
          spinner,
          "Migration failed",
          async () => await pendingMigrations(apiRoot)
        );
        spinner.stop();

        if (result.pending.length === 0) {
          yield* Console.log(chalk.green("✓ No pending migrations"));
          return;
        }

        yield* Console.log(
          chalk.yellow(`${result.pending.length} pending migration(s):`)
        );
        yield* printPendingMigrations(result.pending);

        if (dryRun) {
          yield* Console.log(
            chalk.blue("\n[DRY RUN] No migrations were applied")
          );
          return;
        }

        for (const migration of result.pending) {
          spinner.start(`Applying ${migration.fileName}`);
          yield* tryCommandPromise(spinner, "Migration failed", async () => {
            await migration.up(apiRoot);
            await recordMigration(apiRoot, migration.key);
          });
          spinner.succeed(`Applied ${migration.fileName}`);
        }
      })
  ).pipe(
    Command.withDescription("Apply pending Commercetools schema migrations")
  );

  const status = Command.make("status", {}, () =>
    Effect.gen(function* () {
      const { apiRoot } = yield* CommercetoolsRestClient;
      const spinner = ora("Loading migration status").start();

      const result = yield* tryCommandPromise(
        spinner,
        "Failed to load migration status",
        async () => await pendingMigrations(apiRoot)
      );
      spinner.stop();

      yield* Console.log(chalk.blue("Migration status:"));
      yield* Console.log(`  Total: ${result.migrations.length}`);
      yield* Console.log(`  Applied: ${result.applied.length}`);
      yield* Console.log(`  Pending: ${result.pending.length}`);

      if (result.pending.length > 0) {
        yield* Console.log(chalk.yellow("\nPending migrations:"));
        yield* printPendingMigrations(result.pending);
      }
    })
  ).pipe(Command.withDescription("Show applied and pending migrations"));

  const plan = Command.make("plan", {}, () =>
    Effect.gen(function* () {
      const { apiRoot } = yield* CommercetoolsRestClient;
      const spinner = ora("Planning migrations").start();

      const result = yield* tryCommandPromise(
        spinner,
        "Failed to plan migrations",
        async () => await pendingMigrations(apiRoot)
      );
      spinner.stop();

      if (result.pending.length === 0) {
        yield* Console.log(chalk.green("✓ No pending migrations"));
        return;
      }

      yield* Console.log(
        chalk.blue(`Would apply ${result.pending.length} migration(s):`)
      );
      yield* printPendingMigrations(result.pending);
    })
  ).pipe(
    Command.withDescription("Show pending migrations without applying them")
  );

  const create = Command.make(
    "create",
    {
      description: Flag.string("description").pipe(
        Flag.withAlias("d"),
        Flag.withDescription("Migration description"),
        Flag.optional
      ),
      name: Argument.string("name"),
    },
    ({ description, name }) => {
      const spinner = ora("Creating migration").start();

      return Effect.tryPromise({
        catch: (cause) => {
          spinner.fail("Failed to create migration");
          return new CliError.UserError({ cause });
        },
        try: async () => {
          const fileName = await createMigration(
            MIGRATIONS_DIRECTORY,
            name,
            Option.getOrElse(description, () => `Migration: ${name}`)
          );
          spinner.succeed(`Created ${fileName}`);
        },
      });
    }
  ).pipe(Command.withDescription("Create a timestamped migration file"));

  return migrate.pipe(Command.withSubcommands([status, plan, create]));
};
