/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- Effect Schema classes keep the migration model and its typed errors together. */

import { Schema } from "effect";

import type { ContentstackStack } from "../provisioning/model";

export const ContentstackMigrationVersion = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1)
);

export class ContentstackMigration extends Schema.Class<ContentstackMigration>(
  "ContentstackMigration"
)({
  file: Schema.NonEmptyString,
  fileName: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
}) {}

export class AppliedContentstackMigration extends Schema.Class<AppliedContentstackMigration>(
  "AppliedContentstackMigration"
)({
  appliedAt: Schema.NonEmptyString,
  appliedBy: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
  version: ContentstackMigrationVersion,
}) {}

export class ContentstackMigrationState extends Schema.Class<ContentstackMigrationState>(
  "ContentstackMigrationState"
)({
  applied: Schema.Array(AppliedContentstackMigration),
  migrations: Schema.Array(ContentstackMigration),
  pending: Schema.Array(ContentstackMigration),
}) {}

export class ContentstackMigrationReceipt extends Schema.Class<ContentstackMigrationReceipt>(
  "ContentstackMigrationReceipt"
)({
  applied: Schema.Array(ContentstackMigration),
}) {}

export interface ContentstackMigrationTarget {
  readonly region: string;
  readonly stack: ContentstackStack;
}

export class ContentstackMigrationDiscoveryError extends Schema.TaggedError<ContentstackMigrationDiscoveryError>()(
  "ContentstackMigrationDiscoveryError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
  }
) {}

export class ContentstackMigrationLedgerError extends Schema.TaggedError<ContentstackMigrationLedgerError>()(
  "ContentstackMigrationLedgerError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals(["initialize", "read", "record"]),
  }
) {}
