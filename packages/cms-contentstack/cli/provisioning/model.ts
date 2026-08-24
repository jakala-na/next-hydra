/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- Effect Schema classes keep the provisioning model and its typed errors together. */

import { RuntimeEnvironmentPublicationReceipt } from "@repo/cli-core/runtime-environment";
import { Schema } from "effect";

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const ContentstackApiKey = Schema.NonEmptyString.pipe(
  Schema.brand("ContentstackApiKey")
);
export type ContentstackApiKey = typeof ContentstackApiKey.Type;

export const CONTENTSTACK_ENVIRONMENTS = ["development", "production"] as const;
export const ContentstackEnvironment = Schema.Literals(
  CONTENTSTACK_ENVIRONMENTS
);
export type ContentstackEnvironment = typeof ContentstackEnvironment.Type;

export class ContentstackRuntimeCredentials extends Schema.Class<ContentstackRuntimeCredentials>(
  "ContentstackRuntimeCredentials"
)({
  apiKey: ContentstackApiKey,
  deliveryToken: Schema.Redacted(Schema.NonEmptyString),
  environment: ContentstackEnvironment,
  graphqlHost: Schema.NonEmptyString,
  graphqlPreviewHost: Schema.NonEmptyString,
  previewToken: Schema.Redacted(Schema.NonEmptyString),
  region: Schema.NonEmptyString,
  webhookSecret: Schema.Redacted(Schema.String),
}) {}

export class ContentstackRuntimeEndpoints extends Schema.Class<ContentstackRuntimeEndpoints>(
  "ContentstackRuntimeEndpoints"
)({
  graphqlHost: Schema.NonEmptyString,
  graphqlPreviewHost: Schema.NonEmptyString,
  region: Schema.NonEmptyString,
}) {}

export class ContentstackStack extends Schema.Class<ContentstackStack>(
  "ContentstackStack"
)({
  apiKey: ContentstackApiKey,
  managementToken: Schema.Redacted(Schema.NonEmptyString),
  managementTokenAlias: Schema.NonEmptyString,
}) {}

export class ContentstackRecipeReceipt extends Schema.Class<ContentstackRecipeReceipt>(
  "ContentstackRecipeReceipt"
)({
  directory: Schema.NonEmptyString,
  environments: Schema.Array(ContentstackEnvironment),
  version: Schema.NonEmptyString,
}) {}

export class ContentstackProvisioningReceipt extends Schema.Class<ContentstackProvisioningReceipt>(
  "ContentstackProvisioningReceipt"
)({
  apiKey: ContentstackApiKey,
  credentials: RuntimeEnvironmentPublicationReceipt,
  environments: Schema.Array(ContentstackEnvironment),
  imported: Schema.Boolean,
  livePreviewConfigurationRequired: Schema.Boolean,
  migrationsApplied: NonNegativeInt,
  recipeVersion: Schema.NonEmptyString,
  region: Schema.NonEmptyString,
}) {}

export class ContentstackCliError extends Schema.TaggedError<ContentstackCliError>()(
  "ContentstackCliError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals([
      "import",
      "migrate",
      "region",
      "resolveAlias",
      "version",
    ]),
  }
) {}

export class ContentstackCliVersionError extends Schema.TaggedError<ContentstackCliVersionError>()(
  "ContentstackCliVersionError",
  {
    actual: Schema.String,
    cause: Schema.Defect(),
    expected: Schema.NonEmptyString,
    message: Schema.String,
  }
) {}

export class ContentstackRecipeError extends Schema.TaggedError<ContentstackRecipeError>()(
  "ContentstackRecipeError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals(["copy", "locate", "render", "validateUrl"]),
  }
) {}

export class ContentstackCredentialInputError extends Schema.TaggedError<ContentstackCredentialInputError>()(
  "ContentstackCredentialInputError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
  }
) {}
