import { Schema } from "effect";

export class ContentSearchAppInstallationError extends Schema.TaggedError<ContentSearchAppInstallationError>()(
  "ContentSearchAppInstallationError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.String,
  }
) {}
