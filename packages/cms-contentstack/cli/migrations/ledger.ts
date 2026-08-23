import { Context, Layer } from "effect";
import type { Effect } from "effect";

import type {
  AppliedContentstackMigration,
  ContentstackMigration,
  ContentstackMigrationLedgerError,
  ContentstackMigrationTarget,
} from "./model";

export interface ContentstackMigrationStore {
  readonly applied: () => Effect.Effect<
    readonly AppliedContentstackMigration[],
    ContentstackMigrationLedgerError
  >;
  readonly record: (
    migration: ContentstackMigration
  ) => Effect.Effect<void, ContentstackMigrationLedgerError>;
}

interface ContentstackMigrationLedgerValue {
  readonly open: (
    target: ContentstackMigrationTarget
  ) => Effect.Effect<
    ContentstackMigrationStore,
    ContentstackMigrationLedgerError
  >;
}

export class ContentstackMigrationLedger extends Context.Service<
  ContentstackMigrationLedger,
  ContentstackMigrationLedgerValue
>()("@repo/cms-contentstack/ContentstackMigrationLedger") {
  static readonly layerFrom = (value: ContentstackMigrationLedgerValue) =>
    Layer.succeed(
      ContentstackMigrationLedger,
      ContentstackMigrationLedger.of(value)
    );
}
