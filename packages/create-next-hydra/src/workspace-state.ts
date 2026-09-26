import { isDeepStrictEqual } from "node:util";

import { Context, Effect, FileSystem, Layer, Path, Ref, Schema } from "effect";
import type { PlatformError } from "effect";

import type {
  WorkspaceLockAuthorizationRequired,
  WorkspaceLockChanged,
} from "./errors.ts";
import {
  WorkspaceBusy,
  WorkspaceRecoveryRequired,
  WorkspaceStateInvalid,
} from "./errors.ts";
import { cacheDirectories, isEnvironmentFile } from "./file-policy.ts";
import { relativeFile } from "./files.ts";
import { workspaceSetting } from "./initialization.ts";
import { FileOrigin } from "./model.ts";
import { withWriteLock } from "./workspace-lock.ts";

const Fingerprint = Schema.Struct({ hash: Schema.String, mode: Schema.Int });
export type Fingerprint = typeof Fingerprint.Type;
export const sameFingerprint = (
  left: Fingerprint | null,
  right: Fingerprint | null
): boolean =>
  left === null || right === null
    ? left === right
    : left.hash === right.hash && left.mode === right.mode;
const Entry = Schema.Struct({
  applied: Fingerprint,
  desired: Fingerprint,
  origin: FileOrigin,
  target: Schema.String,
});
const Intent = Schema.Struct({
  after: Schema.NullOr(Fingerprint),
  before: Schema.NullOr(Fingerprint),
  desired: Schema.NullOr(Fingerprint),
  origin: Schema.NullOr(FileOrigin),
  target: Schema.String,
  temporary: Schema.NullOr(Schema.String),
});
export type FileIntent = typeof Intent.Type;
const Installation = Schema.Struct({
  inputs: Schema.String,
  lockfile: Fingerprint,
  modules: Fingerprint,
  toolchain: Schema.String,
  virtualLock: Fingerprint,
});
const Snapshot = Schema.Struct({
  commit: Schema.String,
  filesRevision: Schema.Int,
  origins: Schema.Array(
    Schema.Struct({ origin: FileOrigin, target: Schema.String })
  ),
  revision: Schema.Int,
});
const Initialization = Schema.Struct({
  status: Schema.Literals(["planned", "started", "completed"]),
  target: Schema.String,
});
export type Installation = typeof Installation.Type;
const Receipt = Schema.Struct({
  directory: Schema.String,
  entries: Schema.Array(Entry),
  filesRevision: Schema.Int,
  format: Schema.Literal("effect-workspace"),
  installation: Schema.NullOr(Installation),
  pending: Schema.NullOr(
    Schema.Union([
      Schema.Struct({
        files: Schema.Array(Intent),
        initialization: Schema.Array(Initialization),
        kind: Schema.Literal("files"),
      }),
      Schema.Struct({
        inputs: Schema.String,
        kind: Schema.Literal("installation"),
        stopped: Schema.Boolean,
      }),
    ])
  ),
  revision: Schema.Int,
  snapshot: Schema.NullOr(Snapshot),
  sourceRoot: Schema.String,
  version: Schema.Literal(1),
});
type Receipt = typeof Receipt.Type;
export type WorkspaceStateError =
  | WorkspaceLockAuthorizationRequired
  | WorkspaceLockChanged
  | PlatformError.PlatformError
  | WorkspaceStateInvalid
  | WorkspaceRecoveryRequired
  | WorkspaceBusy;
export interface WorkspaceIdentity {
  readonly directory: string;
  readonly sourceRoot: string;
}

export interface WorkspaceObservation {
  readonly directory: string;
  readonly initialized: boolean;
  readonly entries: Receipt["entries"];
  readonly installation: Installation | null;
  readonly snapshot: typeof Snapshot.Type | null;
  readonly revision: number;
  readonly filesRevision: number;
  readonly pending: Receipt["pending"];
}

function validFingerprint(value: Fingerprint | null): boolean {
  return (
    value === null ||
    (/^[a-f0-9]{64}$/u.test(value.hash) &&
      value.mode >= 0 &&
      value.mode <= 0o777)
  );
}

const validateOwnedTargets = (names: readonly string[], directory: string) =>
  Effect.gen(function* () {
    const invalid = () => new WorkspaceStateInvalid({ directory });
    const targets = new Set(names);
    if (targets.size !== names.length) {
      return yield* invalid();
    }
    for (const name of names) {
      const target = yield* relativeFile(name).pipe(Effect.mapError(invalid));
      if (
        target !== name ||
        target.startsWith(".workspace-composition") ||
        workspaceSetting(target) ||
        isEnvironmentFile(target) ||
        target.split("/").some((part) => cacheDirectories.has(part))
      ) {
        return yield* invalid();
      }
      const parts = target.split("/");
      for (let end = 1; end < parts.length; end += 1) {
        const ancestor = parts.slice(0, end).join("/");
        if (
          targets.has(ancestor) ||
          workspaceSetting(ancestor) ||
          isEnvironmentFile(ancestor)
        ) {
          return yield* invalid();
        }
      }
    }
  });

const validateFileIntent = (receipt: Receipt) =>
  Effect.gen(function* () {
    if (receipt.pending?.kind !== "files") {
      return;
    }
    const invalid = () =>
      new WorkspaceStateInvalid({ directory: receipt.directory });
    const previous = new Map(
      receipt.entries.map((entry) => [entry.target, entry])
    );
    const ownedTargets = receipt.pending.files.flatMap((file) =>
      file.temporary === null ? [file.target] : [file.target, file.temporary]
    );
    yield* validateOwnedTargets(ownedTargets, receipt.directory);
    const allTargets = [
      ...ownedTargets,
      ...receipt.pending.initialization.map((file) => file.target),
    ];
    const targets = new Set(allTargets);
    if (targets.size !== allTargets.length) {
      return yield* invalid();
    }
    for (const file of receipt.pending.initialization) {
      const target = yield* relativeFile(file.target).pipe(
        Effect.mapError(invalid)
      );
      if (
        target !== file.target ||
        (target !== ".gitignore" && !isEnvironmentFile(target)) ||
        target.startsWith(".workspace-composition") ||
        target.split("/").some((part) => cacheDirectories.has(part))
      ) {
        return yield* invalid();
      }
      const parts = target.split("/");
      for (let end = 1; end < parts.length; end += 1) {
        const ancestor = parts.slice(0, end).join("/");
        if (
          targets.has(ancestor) ||
          workspaceSetting(ancestor) ||
          isEnvironmentFile(ancestor)
        ) {
          return yield* invalid();
        }
      }
    }
    for (const file of receipt.pending.files) {
      const entry = previous.get(file.target);
      if (
        ![file.before, file.after, file.desired].every(validFingerprint) ||
        (file.after === null) !== (file.desired === null) ||
        (file.after === null) !== (file.origin === null) ||
        (entry
          ? !sameFingerprint(file.before, entry.applied) &&
            !sameFingerprint(file.before, file.after)
          : file.before !== null)
      ) {
        return yield* invalid();
      }
      const replaces =
        file.before !== null &&
        file.after !== null &&
        !sameFingerprint(file.before, file.after);
      if (
        replaces !== (file.temporary !== null) ||
        (file.temporary !== null &&
          (!file.temporary.startsWith(`${file.target}.`) ||
            !file.temporary.endsWith(".pending")))
      ) {
        return yield* invalid();
      }
      previous.delete(file.target);
    }
    if (previous.size > 0) {
      return yield* invalid();
    }
  });

const decodeReceipt = (
  identity: WorkspaceIdentity,
  original: string | null,
  allowIncomplete = false
) =>
  Effect.gen(function* () {
    if (original === null) {
      return null;
    }
    const { directory, sourceRoot } = identity;
    const invalid = () => new WorkspaceStateInvalid({ directory });
    const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(Receipt))(
      original,
      { onExcessProperty: "error" }
    ).pipe(Effect.mapError(invalid));
    if (
      decoded.directory !== directory ||
      decoded.sourceRoot !== sourceRoot ||
      decoded.revision < 1 ||
      decoded.filesRevision < 0 ||
      decoded.filesRevision > decoded.revision
    ) {
      return yield* invalid();
    }
    if (
      decoded.snapshot &&
      (!/^[a-f0-9]{40}$/u.test(decoded.snapshot.commit) ||
        decoded.snapshot.revision < 1 ||
        decoded.snapshot.revision > decoded.revision ||
        decoded.snapshot.filesRevision < 0 ||
        decoded.snapshot.filesRevision > decoded.filesRevision)
    ) {
      return yield* invalid();
    }
    yield* validateOwnedTargets(
      decoded.entries.map((entry) => entry.target),
      directory
    );
    if (decoded.snapshot) {
      yield* validateOwnedTargets(
        decoded.snapshot.origins.map((entry) => entry.target),
        directory
      );
    }
    for (const entry of decoded.entries) {
      if (![entry.desired, entry.applied].every(validFingerprint)) {
        return yield* invalid();
      }
    }
    yield* validateFileIntent(decoded);
    if (decoded.pending !== null && !allowIncomplete) {
      return yield* new WorkspaceRecoveryRequired({ directory });
    }
    return decoded;
  });

export interface WorkspaceWriteAccess {
  readonly recoveryEvidence: string | null;
  readonly directory: string;
  readonly observation: Effect.Effect<WorkspaceObservation>;
  readonly recoverFiles: (
    observed: ReadonlyMap<string, Fingerprint | null>,
    expectedRevision: number
  ) => Effect.Effect<void, WorkspaceStateError>;
  readonly publishSnapshot: (
    commit: string,
    expectedRevision: number
  ) => Effect.Effect<void, WorkspaceStateError>;
  readonly begin: (
    files: readonly FileIntent[],
    initialization: readonly string[]
  ) => Effect.Effect<void, WorkspaceStateError>;
  readonly complete: Effect.Effect<void, WorkspaceStateError>;
  readonly initialize: <A, E, R>(
    target: string,
    write: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | WorkspaceStateError, R>;
  readonly installation: Effect.Effect<Installation | null>;
  readonly appliedEntries: Effect.Effect<Receipt["entries"]>;
  readonly beginInstall: (
    inputs: string
  ) => Effect.Effect<void, WorkspaceStateError>;
  readonly installStopped: Effect.Effect<void, WorkspaceStateError>;
  readonly recoverInstall: (
    expectedRevision: number
  ) => Effect.Effect<void, WorkspaceStateError>;
  readonly finishInstall: (
    evidence: Installation | null,
    lockfile: Fingerprint
  ) => Effect.Effect<void, WorkspaceStateError>;
}

export class WorkspaceState extends Context.Service<
  WorkspaceState,
  {
    readonly withRead: <A, E, R>(
      identity: WorkspaceIdentity,
      use: (observation: WorkspaceObservation) => Effect.Effect<A, E, R>,
      options?: { readonly allowIncomplete: boolean }
    ) => Effect.Effect<A, E | WorkspaceStateError, R>;
    readonly withWrite: <A, E, R>(
      identity: WorkspaceIdentity,
      use: (access: WorkspaceWriteAccess) => Effect.Effect<A, E, R>,
      options?: { readonly breakLock?: string }
    ) => Effect.Effect<A, E | WorkspaceStateError, R>;
  }
>()("create-next-hydra/WorkspaceState") {
  static readonly layer = Layer.effect(
    WorkspaceState,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const withRead: WorkspaceState["Service"]["withRead"] = (
        identity,
        use,
        options
      ) =>
        Effect.gen(function* () {
          const directory = path.resolve(identity.directory);
          const sourceRoot = path.resolve(identity.sourceRoot);
          const receiptPath = path.join(
            directory,
            ".workspace-composition.json"
          );
          const lock = path.join(directory, ".workspace-composition.lock");
          const assertIdle = Effect.gen(function* () {
            if (yield* fs.exists(lock)) {
              return yield* new WorkspaceBusy({ directory });
            }
          });
          const read = Effect.gen(function* () {
            return (yield* fs.exists(receiptPath))
              ? yield* fs.readFileString(receiptPath)
              : null;
          });
          yield* assertIdle;
          const original = yield* read;
          const decoded = yield* decodeReceipt(
            { directory, sourceRoot },
            original,
            options?.allowIncomplete
          );
          const result = yield* use({
            directory,
            entries: decoded?.entries ?? [],
            filesRevision: decoded?.filesRevision ?? 0,
            initialized: decoded !== null,
            installation: decoded?.installation ?? null,
            pending: decoded?.pending ?? null,
            revision: decoded?.revision ?? 0,
            snapshot: decoded?.snapshot ?? null,
          });
          yield* assertIdle;
          if ((yield* read) !== original) {
            return yield* new WorkspaceStateInvalid({ directory });
          }
          return result;
        });
      const withWrite: WorkspaceState["Service"]["withWrite"] = (
        identity,
        use,
        options
      ) => {
        const directory = path.resolve(identity.directory);
        const sourceRoot = path.resolve(identity.sourceRoot);
        const receiptPath = path.join(directory, ".workspace-composition.json");
        const lock = path.join(directory, ".workspace-composition.lock");
        const invalid = () => new WorkspaceStateInvalid({ directory });
        return withWriteLock(
          directory,
          ({ writer, assertOwner, recoveryEvidence }) =>
            Effect.gen(function* () {
              const active = yield* Ref.make(true);
              const original = (yield* fs.exists(receiptPath))
                ? yield* fs.readFileString(receiptPath)
                : null;
              const decoded = yield* decodeReceipt(
                { directory, sourceRoot },
                original,
                true
              );
              const current = yield* Ref.make<Receipt>(
                decoded ?? {
                  directory,
                  entries: [],
                  filesRevision: 0,
                  format: "effect-workspace",
                  installation: null,
                  pending: null,
                  revision: 0,
                  snapshot: null,
                  sourceRoot,
                  version: 1,
                }
              );
              const expected = yield* Ref.make(original);
              const record = (next: Receipt) =>
                Effect.gen(function* () {
                  yield* assertOwner;
                  if (!(yield* Ref.get(active))) {
                    return yield* invalid();
                  }
                  const observed = (yield* fs.exists(receiptPath))
                    ? yield* fs.readFileString(receiptPath)
                    : null;
                  if (observed !== (yield* Ref.get(expected))) {
                    return yield* invalid();
                  }
                  const text = yield* Schema.encodeEffect(
                    Schema.fromJsonString(Receipt)
                  )(next).pipe(Effect.mapError(invalid));
                  // The lock owns this temporary file. Failed publication leaves it
                  // in place and prevents release, rather than discarding evidence.
                  const temporary = path.join(lock, "receipt.json");
                  yield* fs.writeFileString(temporary, text, {
                    flag: "wx",
                    mode: 0o600,
                  });
                  yield* fs.rename(temporary, receiptPath);
                  yield* Ref.set(expected, text);
                  yield* Ref.set(current, next);
                }).pipe(Effect.uninterruptible);
              const begin = (
                files: readonly FileIntent[],
                initialization: readonly string[]
              ) =>
                Effect.gen(function* () {
                  const state = yield* Ref.get(current);
                  if (state.pending !== null) {
                    return yield* new WorkspaceRecoveryRequired({
                      directory,
                    });
                  }
                  const next: Receipt = {
                    ...state,
                    pending: {
                      files,
                      initialization: initialization.map((target) => ({
                        status: "planned",
                        target,
                      })),
                      kind: "files",
                    },
                    revision: state.revision + 1,
                  };
                  yield* validateFileIntent(next);
                  yield* record(next);
                });
              const recordInitialization = (
                target: string,
                status: "started" | "completed"
              ) =>
                Effect.gen(function* () {
                  const state = yield* Ref.get(current);
                  const expectedStatus =
                    status === "started" ? "planned" : "started";
                  if (
                    state.pending?.kind !== "files" ||
                    state.pending.initialization.find(
                      (file) => file.target === target
                    )?.status !== expectedStatus
                  ) {
                    return yield* invalid();
                  }
                  yield* record({
                    ...state,
                    pending: {
                      ...state.pending,
                      initialization: state.pending.initialization.map(
                        (file) =>
                          file.target === target ? { ...file, status } : file
                      ),
                    },
                    revision: state.revision + 1,
                  });
                });
              const initialize: WorkspaceWriteAccess["initialize"] = (
                target,
                write
              ) =>
                Effect.gen(function* () {
                  yield* recordInitialization(target, "started");
                  const result = yield* write;
                  yield* recordInitialization(target, "completed");
                  return result;
                }).pipe(Effect.uninterruptible);
              const complete = Effect.gen(function* () {
                const state = yield* Ref.get(current);
                if (
                  state.pending?.kind !== "files" ||
                  state.pending.initialization.some(
                    (file) => file.status !== "completed"
                  )
                ) {
                  return yield* invalid();
                }
                const entries = state.pending.files.flatMap((file) =>
                  file.after === null ||
                  file.desired === null ||
                  file.origin === null
                    ? []
                    : [
                        {
                          applied: file.after,
                          desired: file.desired,
                          origin: file.origin,
                          target: file.target,
                        },
                      ]
                );
                const previous = new Map(
                  state.entries.map((entry) => [entry.target, entry])
                );
                const changed =
                  entries.length !== previous.size ||
                  entries.some((entry) => {
                    const old = previous.get(entry.target);
                    return (
                      !old ||
                      !sameFingerprint(entry.applied, old.applied) ||
                      !sameFingerprint(entry.desired, old.desired) ||
                      !isDeepStrictEqual(entry.origin, old.origin)
                    );
                  });
                yield* record({
                  ...state,
                  entries,
                  filesRevision: state.filesRevision + Number(changed),
                  pending: null,
                  revision: state.revision + 1,
                });
              });
              const recoverFiles: WorkspaceWriteAccess["recoverFiles"] = (
                observed,
                expectedRevision
              ) =>
                Effect.gen(function* () {
                  const state = yield* Ref.get(current);
                  if (
                    state.revision !== expectedRevision ||
                    state.pending?.kind !== "files" ||
                    observed.size !== state.pending.files.length
                  ) {
                    return yield* invalid();
                  }
                  const previous = new Map(
                    state.entries.map((entry) => [entry.target, entry])
                  );
                  const entries: (typeof Entry.Type)[] = [];
                  for (const file of state.pending.files) {
                    const currentFile = observed.get(file.target);
                    if (currentFile === undefined) {
                      return yield* invalid();
                    }
                    if (sameFingerprint(currentFile, file.after)) {
                      if (
                        file.after !== null &&
                        file.desired !== null &&
                        file.origin !== null
                      ) {
                        entries.push({
                          applied: file.after,
                          desired: file.desired,
                          origin: file.origin,
                          target: file.target,
                        });
                      }
                    } else if (sameFingerprint(currentFile, file.before)) {
                      const entry = previous.get(file.target);
                      if (
                        !sameFingerprint(currentFile, entry?.applied ?? null)
                      ) {
                        return yield* invalid();
                      }
                      if (entry) {
                        entries.push(entry);
                      }
                    } else {
                      return yield* new WorkspaceRecoveryRequired({
                        directory,
                      });
                    }
                    previous.delete(file.target);
                  }
                  if (previous.size > 0) {
                    return yield* invalid();
                  }
                  yield* record({
                    ...state,
                    entries,
                    filesRevision: state.filesRevision + 1,
                    installation: null,
                    pending: null,
                    revision: state.revision + 1,
                  });
                });
              const beginInstall = (inputs: string) =>
                Effect.gen(function* () {
                  const state = yield* Ref.get(current);
                  if (state.pending !== null) {
                    return yield* invalid();
                  }
                  yield* record({
                    ...state,
                    pending: { inputs, kind: "installation", stopped: false },
                    revision: state.revision + 1,
                  });
                  yield* Ref.set(writer, true);
                }).pipe(Effect.uninterruptible);
              const installStopped = Effect.gen(function* () {
                const state = yield* Ref.get(current);
                if (state.pending?.kind !== "installation") {
                  return yield* invalid();
                }
                // Persist confirmed process completion before releasing the lease.
                // An in-memory flag cannot justify recovery in another invocation.
                yield* record({
                  ...state,
                  pending: { ...state.pending, stopped: true },
                  revision: state.revision + 1,
                });
                yield* Ref.set(writer, false);
              }).pipe(Effect.uninterruptible);
              const recoverInstall = (expectedRevision: number) =>
                Effect.gen(function* () {
                  const state = yield* Ref.get(current);
                  if (
                    state.revision !== expectedRevision ||
                    state.pending?.kind !== "installation" ||
                    !state.pending.stopped ||
                    (yield* Ref.get(writer))
                  ) {
                    return yield* invalid();
                  }
                  yield* record({
                    ...state,
                    installation: null,
                    pending: null,
                    revision: state.revision + 1,
                  });
                });
              const finishInstall = (
                installation: Installation | null,
                lockfile: Fingerprint
              ) =>
                Effect.gen(function* () {
                  const state = yield* Ref.get(current);
                  if (
                    state.pending?.kind !== "installation" ||
                    !state.pending.stopped ||
                    (yield* Ref.get(writer)) ||
                    (installation &&
                      installation.inputs !== state.pending.inputs)
                  ) {
                    return yield* invalid();
                  }
                  const previousLock = state.entries.find(
                    (entry) => entry.target === "pnpm-lock.yaml"
                  );
                  if (!previousLock) {
                    return yield* invalid();
                  }
                  yield* record({
                    ...state,
                    entries: state.entries.map((entry) =>
                      entry.target === "pnpm-lock.yaml"
                        ? { ...entry, applied: lockfile }
                        : entry
                    ),
                    filesRevision:
                      state.filesRevision +
                      Number(!sameFingerprint(previousLock.applied, lockfile)),
                    installation,
                    pending: null,
                    revision: state.revision + 1,
                  });
                });
              return yield* use({
                appliedEntries: Ref.get(current).pipe(
                  Effect.map((state) => state.entries)
                ),
                begin,
                beginInstall,
                complete,
                directory,
                finishInstall,
                initialize,
                installStopped,
                installation: Ref.get(current).pipe(
                  Effect.map((state) => state.installation)
                ),
                observation: Ref.get(current).pipe(
                  Effect.map((state) => ({
                    directory,
                    entries: state.entries,
                    filesRevision: state.filesRevision,
                    initialized: state.revision > 0,
                    installation: state.installation,
                    pending: state.pending,
                    revision: state.revision,
                    snapshot: state.snapshot,
                  }))
                ),
                publishSnapshot: (commit, expectedRevision) =>
                  Effect.gen(function* () {
                    const state = yield* Ref.get(current);
                    if (
                      state.pending !== null ||
                      state.revision !== expectedRevision ||
                      !/^[a-f0-9]{40}$/u.test(commit)
                    ) {
                      return yield* invalid();
                    }
                    yield* record({
                      ...state,
                      revision: state.revision + 1,
                      snapshot: {
                        commit,
                        filesRevision: state.filesRevision,
                        origins: state.entries.map(({ target, origin }) => ({
                          origin,
                          target,
                        })),
                        revision: state.revision + 1,
                      },
                    });
                  }),
                recoverFiles,
                recoverInstall,
                recoveryEvidence,
              }).pipe(Effect.ensuring(Ref.set(active, false)));
            }),
          options
        ).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        );
      };
      return WorkspaceState.of({ withRead, withWrite });
    })
  );
}
