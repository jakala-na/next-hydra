import { Runtime, Schema } from "effect";

export class ApplicationTaskFailed extends Schema.TaggedError<ApplicationTaskFailed>()(
  "ApplicationTaskFailed",
  {
    code: Schema.Int,
    directory: Schema.String,
  }
) {
  get message() {
    return `Application task failed in ${this.directory} (exit ${this.code}).`;
  }
  get [Runtime.errorExitCode]() {
    return this.code;
  }
}

export class IncompatibleSelection extends Schema.TaggedError<IncompatibleSelection>()(
  "IncompatibleSelection",
  {
    conflicts: Schema.Array(Schema.String),
    missing: Schema.Array(Schema.String),
    selection: Schema.String,
  }
) {
  get message() {
    const reasons = [];
    if (this.missing.length) {
      reasons.push(`requires ${this.missing.join(", ")}`);
    }
    if (this.conflicts.length) {
      reasons.push(`conflicts with ${this.conflicts.join(", ")}`);
    }
    return `${this.selection} ${reasons.join("; ")}`;
  }
}

export class InvalidComposition extends Schema.TaggedError<InvalidComposition>()(
  "InvalidComposition",
  { message: Schema.String }
) {}

export class SourceChanged extends Schema.TaggedError<SourceChanged>()(
  "SourceChanged",
  { paths: Schema.Array(Schema.String) }
) {}

export class SourceAcquisitionFailed extends Schema.TaggedError<SourceAcquisitionFailed>()(
  "SourceAcquisitionFailed",
  { diagnostic: Schema.Redacted(Schema.Unknown), phase: Schema.String }
) {
  get message() {
    return `Source acquisition failed during ${this.phase}; no application files were published.`;
  }
}
export class SourceStorageRetained extends Schema.TaggedError<SourceStorageRetained>()(
  "SourceStorageRetained",
  { directory: Schema.String }
) {}

export class DestinationNotEmpty extends Schema.TaggedError<DestinationNotEmpty>()(
  "DestinationNotEmpty",
  { directory: Schema.String }
) {}

export class RegistryFailure extends Schema.TaggedError<RegistryFailure>()(
  "RegistryFailure",
  { diagnostic: Schema.Redacted(Schema.String), operation: Schema.String }
) {}

export class StagingRetained extends Schema.TaggedError<StagingRetained>()(
  "StagingRetained",
  { directory: Schema.String }
) {}

export class RegistryWorkerFailure extends Schema.TaggedError<RegistryWorkerFailure>()(
  "RegistryWorkerFailure",
  { phase: Schema.Literals(["launch", "exit", "protocol", "stop"]) }
) {}

export class MaterializationFailed extends Schema.TaggedError<MaterializationFailed>()(
  "MaterializationFailed",
  {
    completedFiles: Schema.Array(Schema.String),
    diagnostic: Schema.Redacted(Schema.Unknown),
    directory: Schema.String,
    failedFile: Schema.String,
  }
) {}

export class EnvironmentInitializationFailed extends Schema.TaggedError<EnvironmentInitializationFailed>()(
  "EnvironmentInitializationFailed",
  {
    createdFiles: Schema.Array(Schema.String),
    diagnostic: Schema.Redacted(Schema.Unknown),
    directory: Schema.String,
    failedFile: Schema.String,
  }
) {
  get message() {
    return `Environment initialization failed at ${this.failedFile}. Application files may already be present. Preserve and inspect this file before retrying; it may be incomplete.`;
  }
}

export class WorkspaceBusy extends Schema.TaggedError<WorkspaceBusy>()(
  "WorkspaceBusy",
  { directory: Schema.String }
) {
  get message() {
    return `Workspace write lock exists: ${this.directory}. Another operation may be running or may have stopped unexpectedly; no files were changed.`;
  }
}

export class WorkspaceLockAuthorizationRequired extends Schema.TaggedError<WorkspaceLockAuthorizationRequired>()(
  "WorkspaceLockAuthorizationRequired",
  { directory: Schema.String, reason: Schema.String, token: Schema.String }
) {
  get message() {
    return `Lock recovery needs authorization in ${this.directory}: ${this.reason}. Run Compose in an interactive terminal to authorize breaking this lock. Files and recovery evidence have been preserved.`;
  }
}

export class WorkspaceLockChanged extends Schema.TaggedError<WorkspaceLockChanged>()(
  "WorkspaceLockChanged",
  { directory: Schema.String }
) {
  get message() {
    return `The lock in ${this.directory} changed. This operation cannot continue; run Compose again to inspect the current lock.`;
  }
}

export class WorkspaceConflict extends Schema.TaggedError<WorkspaceConflict>()(
  "WorkspaceConflict",
  { paths: Schema.Array(Schema.String) }
) {
  get message() {
    return `Refresh blocked by local changes: ${this.paths.join(", ")}`;
  }
}

export class WorkspaceRecoveryRequired extends Schema.TaggedError<WorkspaceRecoveryRequired>()(
  "WorkspaceRecoveryRequired",
  {
    directory: Schema.String,
    paths: Schema.optionalKey(Schema.Array(Schema.String)),
  }
) {
  get message() {
    if (this.paths !== undefined && this.paths.length > 0) {
      return `Initialization needs inspection in ${this.directory}: ${this.paths.join(", ")}. A write started but completion was not recorded. Preserve and inspect these files; they may be incomplete.`;
    }
    return `An incomplete workspace operation needs inspection: ${this.directory}. Files have been preserved; unresolved initialization, installation or write coordination cannot be recovered automatically.`;
  }
}

export class WorkspaceStateInvalid extends Schema.TaggedError<WorkspaceStateInvalid>()(
  "WorkspaceStateInvalid",
  { directory: Schema.String }
) {
  get message() {
    return `Workspace ownership state is invalid or has changed: ${this.directory}. No ownership was inferred from application files.`;
  }
}

export class WorkspaceNotCurrent extends Schema.TaggedError<WorkspaceNotCurrent>()(
  "WorkspaceNotCurrent",
  { directory: Schema.String }
) {
  get message() {
    return `Workspace needs attention: ${this.directory}. Check did not change any files or install dependencies.`;
  }
}

export class WorkspaceBatchFailed extends Schema.TaggedError<WorkspaceBatchFailed>()(
  "WorkspaceBatchFailed",
  { names: Schema.Array(Schema.String) }
) {
  get message() {
    return `Workspaces needing attention: ${this.names.join(", ")}. Other workspaces were processed independently; rerun after resolving the reported issues.`;
  }
}

export class SnapshotUnavailable extends Schema.TaggedError<SnapshotUnavailable>()(
  "SnapshotUnavailable",
  { directory: Schema.String }
) {
  get message() {
    return `No usable composition snapshot for ${this.directory}. Existing files remain untouched; synchronize only after reconciling local edits.`;
  }
}

export class WorkspaceUninitialized extends Schema.TaggedError<WorkspaceUninitialized>()(
  "WorkspaceUninitialized",
  { directory: Schema.String }
) {
  get message() {
    return `No recorded composition exists for ${this.directory}. Existing application files were not adopted.`;
  }
}

export class SnapshotFailed extends Schema.TaggedError<SnapshotFailed>()(
  "SnapshotFailed",
  { directory: Schema.String, operation: Schema.String }
) {
  get message() {
    return `Composition snapshot ${this.operation} failed for ${this.directory}. The saved baseline was not advanced.`;
  }
}

export class DependencyInstallationFailed extends Schema.TaggedError<DependencyInstallationFailed>()(
  "DependencyInstallationFailed",
  {
    directory: Schema.String,
    phase: Schema.Literals([
      "launch",
      "exit",
      "stop",
      "inputs",
      "outputs",
      "version",
    ]),
  }
) {
  get message() {
    return `Dependency installation failed (${this.phase}) in ${this.directory}. Application files remain applied; dependencies are not current.`;
  }
}
