/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- Effect Schema classes keep the provisioning wire model and its typed errors together. */

import { PrivateDotEnvFileReceipt } from "@repo/cli-core/private-dotenv";
import { Schema } from "effect";

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const ProjectKey = Schema.NonEmptyString.pipe(
  Schema.brand("CommercetoolsProjectKey")
);
export type ProjectKey = typeof ProjectKey.Type;

export const CommercetoolsRegion = Schema.NonEmptyString.pipe(
  Schema.brand("CommercetoolsRegion")
);
export type CommercetoolsRegion = typeof CommercetoolsRegion.Type;

export const ApiClientId = Schema.NonEmptyString.pipe(
  Schema.brand("CommercetoolsApiClientId")
);
export type ApiClientId = typeof ApiClientId.Type;

export class RuntimeCredentials extends Schema.Class<RuntimeCredentials>(
  "RuntimeCredentials"
)({
  clientId: ApiClientId,
  clientSecret: Schema.Redacted(Schema.NonEmptyString, {
    label: "clientSecret",
  }),
  projectKey: ProjectKey,
  region: CommercetoolsRegion,
  scope: Schema.NonEmptyString,
}) {}

export class PreparedProject extends Schema.Class<PreparedProject>(
  "PreparedProject"
)({
  projectKey: ProjectKey,
  searchIndexingStatus: Schema.Literal("Activated"),
}) {}

export class ProjectSeedReceipt extends Schema.Class<ProjectSeedReceipt>(
  "ProjectSeedReceipt"
)({
  migrationsApplied: NonNegativeInt,
}) {}

export class ProvisioningReceipt extends Schema.Class<ProvisioningReceipt>(
  "ProvisioningReceipt"
)({
  bootstrapClientRevoked: Schema.Boolean,
  credentialFile: PrivateDotEnvFileReceipt,
  project: PreparedProject,
  runtimeClientId: ApiClientId,
  scope: Schema.NonEmptyString,
  seed: ProjectSeedReceipt,
}) {}

export class ProjectAdministrationError extends Schema.TaggedError<ProjectAdministrationError>()(
  "ProjectAdministrationError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals([
      "createRuntimeClient",
      "deleteApiClient",
      "enableProductProjectionSearch",
      "getProject",
    ]),
  }
) {}

export class BootstrapApiClientScopeError extends Schema.TaggedError<BootstrapApiClientScopeError>()(
  "BootstrapApiClientScopeError",
  {
    message: Schema.String,
    missingScopes: Schema.Array(Schema.NonEmptyString),
  }
) {}

export class RuntimeClientCreationOutcomeUnknown extends Schema.TaggedError<RuntimeClientCreationOutcomeUnknown>()(
  "RuntimeClientCreationOutcomeUnknown",
  {
    cause: Schema.Defect(),
    clientName: Schema.NonEmptyString,
    message: Schema.String,
  }
) {}

export class ProductProjectionSearchTimeout extends Schema.TaggedError<ProductProjectionSearchTimeout>()(
  "ProductProjectionSearchTimeout",
  {
    lastStatus: Schema.String,
    message: Schema.String,
  }
) {}

export class RuntimeProjectSetupError extends Schema.TaggedError<RuntimeProjectSetupError>()(
  "RuntimeProjectSetupError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    phase: Schema.Literal("migrations"),
  }
) {}
