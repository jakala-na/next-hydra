import contentstack from "@contentstack/management";
import { getContentstackEndpoint } from "@contentstack/utils";
import { DateTime, Effect, Layer, Redacted, Schema } from "effect";

import { ContentstackMigrationLedger } from "./ledger";
import {
  AppliedContentstackMigration,
  ContentstackMigrationLedgerError,
  ContentstackMigrationVersion,
} from "./model";
import type {
  ContentstackMigration,
  ContentstackMigrationTarget,
} from "./model";

const LEDGER_CONTENT_TYPE_UID = "migrations";
const PAGE_SIZE = 100;

const LedgerEntry = Schema.Struct({
  applied_at: Schema.NonEmptyString,
  applied_by: Schema.NonEmptyString,
  migration_key: Schema.NonEmptyString,
  version: ContentstackMigrationVersion,
});
const LedgerEntries = Schema.Array(LedgerEntry);
const decodeEndpoint = Schema.decodeUnknownSync(Schema.NonEmptyString);

const ledgerError = (
  operation: ContentstackMigrationLedgerError["operation"],
  message: string,
  cause: unknown
) => new ContentstackMigrationLedgerError({ cause, message, operation });

const makeStack = (target: ContentstackMigrationTarget) =>
  Effect.try({
    catch: (cause) =>
      ledgerError(
        "initialize",
        "Could not initialize the Contentstack migration ledger",
        cause
      ),
    try: () => {
      const host = decodeEndpoint(
        getContentstackEndpoint(target.region, "contentManagement", true)
      );
      const client = contentstack.client({ host, retryOnError: false });

      return client.stack({
        api_key: target.stack.apiKey,
        management_token: Redacted.value(target.stack.managementToken),
      });
    },
  });

export const contentstackMigrationLedgerLayer = Layer.succeed(
  ContentstackMigrationLedger,
  ContentstackMigrationLedger.of({
    open: Effect.fn("ContentstackMigrationLedger.open")(function* (target) {
      const stack = yield* makeStack(target);

      return {
        applied: Effect.fn("ContentstackMigrationLedger.applied")(function* () {
          const applied: AppliedContentstackMigration[] = [];
          let skip = 0;

          while (true) {
            const pageSkip = skip;
            const page = yield* Effect.tryPromise({
              catch: (cause) =>
                ledgerError(
                  "read",
                  "Could not read applied Contentstack migrations",
                  cause
                ),
              try: async () =>
                await stack
                  .contentType(LEDGER_CONTENT_TYPE_UID)
                  .entry()
                  .query({ limit: PAGE_SIZE, skip: pageSkip })
                  .find(),
            });

            const entries = yield* Schema.decodeUnknownEffect(LedgerEntries)(
              page.items
            ).pipe(
              Effect.mapError((cause) =>
                ledgerError(
                  "read",
                  "A Contentstack migration ledger entry is invalid",
                  cause
                )
              )
            );

            applied.push(
              ...entries.map(
                (entry) =>
                  new AppliedContentstackMigration({
                    appliedAt: entry.applied_at,
                    appliedBy: entry.applied_by,
                    key: entry.migration_key,
                    version: entry.version,
                  })
              )
            );

            if (page.items.length < PAGE_SIZE) {
              return applied;
            }

            skip += PAGE_SIZE;
          }
        }),
        record: Effect.fn("ContentstackMigrationLedger.record")(function* (
          migration: ContentstackMigration
        ) {
          const now = yield* DateTime.now;

          yield* Effect.tryPromise({
            catch: (cause) =>
              ledgerError(
                "record",
                `Could not record Contentstack migration ${migration.key}`,
                cause
              ),
            try: async () =>
              await stack
                .contentType(LEDGER_CONTENT_TYPE_UID)
                .entry()
                .create({
                  entry: {
                    applied_at: DateTime.formatIso(now),
                    applied_by: "next-hydra-cli",
                    migration_key: migration.key,
                    title: migration.key,
                    version: 1,
                  },
                }),
          });
        }),
      };
    }),
  })
);
