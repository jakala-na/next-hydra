import { Effect, Schema } from "effect";

import { Binding } from "./templates.ts";

export const Selection = Schema.Struct({
  addOns: Schema.Array(Schema.NonEmptyString).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([]))
  ),
  providers: Schema.Struct({
    auth: Schema.optionalKey(Schema.NonEmptyString),
    cms: Schema.optionalKey(Schema.NonEmptyString),
    commerce: Schema.optionalKey(Schema.NonEmptyString),
  }).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
});
export type Selection = typeof Selection.Type;

export const SelectionRequest = Schema.Union([
  Selection,
  Schema.Struct({
    addOns: Selection.fields.addOns,
    preset: Schema.NonEmptyString,
  }),
]);
export type SelectionRequest = typeof SelectionRequest.Type;

export const DevelopmentPort = Schema.Finite.check(
  Schema.isInt(),
  Schema.isBetween({ maximum: 65_533, minimum: 1024 })
);
export const WorkspaceDefinition = Schema.Struct({
  ...Selection.fields,
  development: Schema.optionalKey(
    Schema.Struct({ port: Schema.optionalKey(DevelopmentPort) })
  ),
});

export interface PreparedFile {
  readonly target: string;
  readonly content: Uint8Array;
  readonly mode: number;
}

export interface PreparedWorkspace {
  readonly files: readonly (PreparedFile & { readonly origin: FileOrigin })[];
  readonly instructions: readonly RegistryInstruction[];
  readonly inputs: SourceInputs;
}

export interface RegistryInstruction {
  readonly item: string;
  readonly text: string;
}

// Derived during preparation, never a second authored inventory or receipt.
export interface SourceInputs {
  readonly files: readonly string[];
  readonly packagePatterns: readonly string[];
  readonly packages: readonly string[];
  readonly excluded: readonly string[];
}

export const FileOrigin = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("registry"), owner: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("workspace-setting"),
    source: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("source"),
    owner: Schema.NullOr(Schema.String),
    source: Schema.String,
  }),
  Schema.Struct({
    bindings: Schema.Array(
      Schema.Struct({ ...Binding.fields, owner: Schema.String })
    ),
    kind: Schema.Literal("template"),
    owner: Schema.String,
    source: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("policy"),
    policy: Schema.Literals([
      "application-manifest",
      "workspace-settings",
      "lockfile-seed",
      "application-tasks",
      "application-ignore",
    ]),
    sources: Schema.Array(Schema.String),
  }),
]);
export type FileOrigin = typeof FileOrigin.Type;

export interface FileExplanation {
  readonly target: string;
  readonly origin: FileOrigin;
}

export interface ExplanationReport {
  readonly sourceRoot: string;
  readonly destination: string;
  readonly files: readonly FileExplanation[];
}

export interface MaterializationReport {
  readonly instructions: readonly RegistryInstruction[];
  readonly origins: readonly FileExplanation[];
  readonly git?: {
    readonly initialized: boolean;
    readonly committed: boolean;
    readonly warning?: string;
  };
  readonly recoveryEvidence?: string | null;
  readonly environmentFilesCreated: readonly string[];
  readonly destination: string;
  readonly files: readonly string[];
  readonly removedFiles: readonly string[];
  readonly dependencies: "pending" | "current";
  readonly dependencyReasons: readonly string[];
}

export interface FileChange {
  readonly target: string;
  readonly kind:
    | "create"
    | "update"
    | "remove"
    | "record"
    | "conflict"
    | "unregistered"
    | "setting";
}

export interface CheckReport {
  readonly destination: string;
  readonly initialized: boolean;
  readonly ready: boolean;
  readonly changes: readonly FileChange[];
  readonly dependencies: "pending" | "current";
  readonly dependencyReasons: readonly string[];
}

export interface DiffReport {
  readonly origins: readonly FileExplanation[];
  readonly snapshot: string;
  readonly incomplete: boolean;
  readonly patch: string;
  readonly changes: readonly {
    readonly target: string;
    readonly status: string;
  }[];
  readonly unregisteredFiles: readonly string[];
  readonly conflicts: readonly string[];
}
