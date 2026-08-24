/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- Effect Schema classes define the runtime-environment boundary. */

import type { Effect } from "effect";
import { Context, Layer, Redacted, Schema } from "effect";

import type { PrivateDotEnvFileError } from "./private-dotenv";

export const RuntimeEnvironmentDestinationName = Schema.Literals([
  "local",
  "vercel",
]);
export type RuntimeEnvironmentDestinationName =
  typeof RuntimeEnvironmentDestinationName.Type;

export const RuntimeEnvironmentPublicationMode = Schema.Literals([
  "create",
  "overwrite",
]);
export type RuntimeEnvironmentPublicationMode =
  typeof RuntimeEnvironmentPublicationMode.Type;

export const RuntimeApplication = Schema.Literals(["web", "api"]);
export type RuntimeApplication = typeof RuntimeApplication.Type;

export const VercelEnvironmentSelector = Schema.NonEmptyString;
export type VercelEnvironmentSelector = typeof VercelEnvironmentSelector.Type;

export class RuntimeEnvironmentVariable extends Schema.Class<RuntimeEnvironmentVariable>(
  "RuntimeEnvironmentVariable"
)({
  applications: Schema.Array(RuntimeApplication),
  key: Schema.NonEmptyString,
  sensitive: Schema.Boolean,
}) {}

export class VercelRuntimeEnvironmentProjectReceipt extends Schema.Class<VercelRuntimeEnvironmentProjectReceipt>(
  "VercelRuntimeEnvironmentProjectReceipt"
)({
  application: RuntimeApplication,
  organizationId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  variables: Schema.Array(Schema.NonEmptyString),
}) {}

export class LocalRuntimeEnvironmentPublicationReceipt extends Schema.Class<LocalRuntimeEnvironmentPublicationReceipt>(
  "LocalRuntimeEnvironmentPublicationReceipt"
)({
  destination: Schema.Literal("local"),
  mode: Schema.Int,
  path: Schema.NonEmptyString,
}) {}

export class VercelRuntimeEnvironmentPublicationReceipt extends Schema.Class<VercelRuntimeEnvironmentPublicationReceipt>(
  "VercelRuntimeEnvironmentPublicationReceipt"
)({
  deploymentRequired: Schema.Literal(true),
  destination: Schema.Literal("vercel"),
  environments: Schema.Array(VercelEnvironmentSelector),
  projects: Schema.Array(VercelRuntimeEnvironmentProjectReceipt),
  publicationMode: RuntimeEnvironmentPublicationMode,
}) {}

export const RuntimeEnvironmentPublicationReceipt = Schema.Union([
  LocalRuntimeEnvironmentPublicationReceipt,
  VercelRuntimeEnvironmentPublicationReceipt,
]);
export type RuntimeEnvironmentPublicationReceipt =
  typeof RuntimeEnvironmentPublicationReceipt.Type;

export class RuntimeEnvironmentPreflightError extends Schema.TaggedError<RuntimeEnvironmentPreflightError>()(
  "RuntimeEnvironmentPreflightError",
  {
    cause: Schema.Defect(),
    destination: RuntimeEnvironmentDestinationName,
    message: Schema.String,
    operation: Schema.Literals([
      "confirmation",
      "conflicts",
      "link",
      "policy",
      "validation",
      "vercel-access",
      "vercel-version",
      "workspace",
    ]),
  }
) {}

export class RuntimeEnvironmentPublicationError extends Schema.TaggedError<RuntimeEnvironmentPublicationError>()(
  "RuntimeEnvironmentPublicationError",
  {
    cause: Schema.Defect(),
    destination: RuntimeEnvironmentDestinationName,
    message: Schema.String,
  }
) {}

export class RuntimeEnvironmentPublicationOutcomeUnknown extends Schema.TaggedError<RuntimeEnvironmentPublicationOutcomeUnknown>()(
  "RuntimeEnvironmentPublicationOutcomeUnknown",
  {
    cause: Schema.Defect(),
    destination: Schema.Literal("vercel"),
    message: Schema.String,
  }
) {}

export class RuntimeEnvironmentPublicationIncomplete extends Schema.TaggedError<RuntimeEnvironmentPublicationIncomplete>()(
  "RuntimeEnvironmentPublicationIncomplete",
  {
    cause: Schema.Defect(),
    destination: Schema.Literal("vercel"),
    failedApplication: RuntimeApplication,
    message: Schema.String,
    publishedApplications: Schema.Array(RuntimeApplication),
  }
) {}

export type RuntimeEnvironmentPublisherError =
  | PrivateDotEnvFileError
  | RuntimeEnvironmentPreflightError
  | RuntimeEnvironmentPublicationError
  | RuntimeEnvironmentPublicationIncomplete
  | RuntimeEnvironmentPublicationOutcomeUnknown;

export interface LocalRuntimeEnvironmentDestination {
  readonly destination: "local";
  readonly output: string;
  readonly publicationMode: RuntimeEnvironmentPublicationMode;
  readonly yes: boolean;
}

export interface VercelRuntimeEnvironmentDestination {
  readonly destination: "vercel";
  readonly environments: readonly VercelEnvironmentSelector[];
  readonly publicationMode: RuntimeEnvironmentPublicationMode;
  readonly workspaceRoot?: string;
  readonly yes: boolean;
}

export type RuntimeEnvironmentDestination =
  | LocalRuntimeEnvironmentDestination
  | VercelRuntimeEnvironmentDestination;

export interface PreparedLocalRuntimeEnvironment {
  readonly destination: "local";
  readonly manifest: readonly RuntimeEnvironmentVariable[];
  readonly path: string;
}

export interface ResolvedVercelEnvironment {
  readonly customEnvironmentId?: string;
  readonly gitBranch?: string;
  readonly selector: string;
  readonly target?: "preview" | "production";
}

export type RequestedVercelEnvironment =
  | {
      readonly kind: "built-in";
      readonly selector: "preview" | "production";
    }
  | {
      readonly gitBranch: string;
      readonly kind: "preview-branch";
      readonly selector: string;
    }
  | {
      readonly kind: "custom";
      readonly selector: string;
      readonly slug: string;
    };

export interface PreparedVercelRuntimeEnvironmentProject {
  readonly application: RuntimeApplication;
  readonly cwd: string;
  readonly environments: readonly ResolvedVercelEnvironment[];
  readonly manifest: readonly RuntimeEnvironmentVariable[];
  readonly organizationId: string;
  readonly projectId: string;
}

export interface PreparedVercelRuntimeEnvironment {
  readonly destination: "vercel";
  readonly environments: readonly VercelEnvironmentSelector[];
  readonly manifest: readonly RuntimeEnvironmentVariable[];
  readonly projects: readonly PreparedVercelRuntimeEnvironmentProject[];
  readonly publicationMode: RuntimeEnvironmentPublicationMode;
}

export type PreparedRuntimeEnvironment =
  | PreparedLocalRuntimeEnvironment
  | PreparedVercelRuntimeEnvironment;

export type RuntimeEnvironmentValue = Redacted.Redacted | string;
export type RuntimeEnvironmentValues = Readonly<
  Record<string, RuntimeEnvironmentValue>
>;

export interface PrepareRuntimeEnvironmentOptions {
  readonly destination: RuntimeEnvironmentDestination;
  readonly manifest: readonly RuntimeEnvironmentVariable[];
}

interface RuntimeEnvironmentPublisherValue {
  readonly prepare: (
    options: PrepareRuntimeEnvironmentOptions
  ) => Effect.Effect<
    PreparedRuntimeEnvironment,
    RuntimeEnvironmentPreflightError
  >;
  readonly publish: (
    prepared: PreparedRuntimeEnvironment,
    values: RuntimeEnvironmentValues
  ) => Effect.Effect<
    RuntimeEnvironmentPublicationReceipt,
    RuntimeEnvironmentPublisherError
  >;
}

export class RuntimeEnvironmentPublisher extends Context.Service<
  RuntimeEnvironmentPublisher,
  RuntimeEnvironmentPublisherValue
>()("@repo/cli-core/RuntimeEnvironmentPublisher") {
  static readonly layerFrom = (value: RuntimeEnvironmentPublisherValue) =>
    Layer.succeed(
      RuntimeEnvironmentPublisher,
      RuntimeEnvironmentPublisher.of(value)
    );
}

export interface LocalRuntimeEnvironmentStoreValue {
  readonly prepare: (
    destination: LocalRuntimeEnvironmentDestination,
    manifest: readonly RuntimeEnvironmentVariable[]
  ) => Effect.Effect<
    PreparedLocalRuntimeEnvironment,
    RuntimeEnvironmentPreflightError
  >;
  readonly publish: (
    prepared: PreparedLocalRuntimeEnvironment,
    values: RuntimeEnvironmentValues
  ) => Effect.Effect<
    LocalRuntimeEnvironmentPublicationReceipt,
    PrivateDotEnvFileError | RuntimeEnvironmentPublicationError
  >;
}

export class LocalRuntimeEnvironmentStore extends Context.Service<
  LocalRuntimeEnvironmentStore,
  LocalRuntimeEnvironmentStoreValue
>()("@repo/cli-core/LocalRuntimeEnvironmentStore") {}

export interface VercelRuntimeEnvironmentStoreValue {
  readonly prepare: (
    destination: VercelRuntimeEnvironmentDestination,
    manifest: readonly RuntimeEnvironmentVariable[]
  ) => Effect.Effect<
    PreparedVercelRuntimeEnvironment,
    RuntimeEnvironmentPreflightError
  >;
  readonly publish: (
    prepared: PreparedVercelRuntimeEnvironment,
    values: RuntimeEnvironmentValues
  ) => Effect.Effect<
    VercelRuntimeEnvironmentPublicationReceipt,
    | RuntimeEnvironmentPublicationError
    | RuntimeEnvironmentPublicationIncomplete
    | RuntimeEnvironmentPublicationOutcomeUnknown
  >;
}

export class VercelRuntimeEnvironmentStore extends Context.Service<
  VercelRuntimeEnvironmentStore,
  VercelRuntimeEnvironmentStoreValue
>()("@repo/cli-core/VercelRuntimeEnvironmentStore") {}

export const runtimeEnvironmentManifestFromSchema = (
  fields: Readonly<Record<string, Schema.Top>>,
  applications: readonly RuntimeApplication[]
) =>
  Object.entries(fields).map(([key, schema]) => {
    const acceptsPlain = Schema.is(schema)("next-hydra-runtime-probe");
    const acceptsRedacted = Schema.is(schema)(
      Redacted.make("next-hydra-runtime-probe")
    );
    if (acceptsPlain === acceptsRedacted) {
      throw new Error(
        `Runtime environment schema for ${key} must accept exactly one of string or Redacted<string>`
      );
    }
    return new RuntimeEnvironmentVariable({
      applications: [...applications],
      key,
      sensitive: acceptsRedacted,
    });
  });

export const runtimeEnvironmentReceiptDescription = (
  receipt: RuntimeEnvironmentPublicationReceipt
) =>
  receipt.destination === "local"
    ? receipt.path
    : `${receipt.projects
        .map(({ application, projectId }) => `${application}: ${projectId}`)
        .join(", ")} (${receipt.environments.join(", ")})`;
