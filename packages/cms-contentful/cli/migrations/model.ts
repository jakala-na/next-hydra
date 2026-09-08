/* oxlint-disable unicorn/throw-new-error -- Schema.TaggedError is the Effect error-class factory. */

import { Schema } from "effect";

export class ContentfulMigrationTarget extends Schema.Class<ContentfulMigrationTarget>(
  "ContentfulMigrationTarget"
)({
  accessToken: Schema.Redacted(Schema.NonEmptyString),
  environmentId: Schema.NonEmptyString,
  spaceId: Schema.NonEmptyString,
}) {}

export class ContentfulMigrationError extends Schema.TaggedError<ContentfulMigrationError>()(
  "ContentfulMigrationError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
  }
) {}
