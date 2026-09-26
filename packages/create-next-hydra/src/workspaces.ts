import {
  Array as EffectArray,
  Cause,
  Context,
  Effect,
  FileSystem,
  Layer,
  Order,
  Path,
  Redacted,
  Schema,
  Fiber,
  Queue,
  Ref,
  Result,
  Stream,
} from "effect";
import type { PlatformError } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import { existingWorkspace } from "./addition.ts";
import type { ExistingWorkspace } from "./addition.ts";
import { initializeApplicationGit } from "./application-git.ts";
import type { ApplicationGitFailed } from "./application-git.ts";
import { Composition } from "./composition.ts";
import type { PreparationError as CompositionError } from "./composition.ts";
import { planEnvironmentCopy, copyEnvironment } from "./environment.ts";
import {
  DestinationNotEmpty,
  InvalidComposition,
  MaterializationFailed,
  SourceChanged,
  SnapshotUnavailable,
  WorkspaceUninitialized,
} from "./errors.ts";
import type { EnvironmentInitializationFailed } from "./errors.ts";
import { relativeFile, writeFile } from "./files.ts";
import {
  inspectInitialization,
  listUnregisteredFiles,
  namedInitializationFiles,
  workspaceSetting,
} from "./initialization.ts";
import { WorkspaceDefinition } from "./model.ts";
import type {
  ExplanationReport,
  CheckReport,
  FileExplanation,
  DiffReport,
  MaterializationReport,
  SelectionRequest,
  SourceInputs,
} from "./model.ts";
import { Shadcn } from "./shadcn.ts";
import { SourceChanges, SourceWatchFailure } from "./source-changes.ts";
import { SourceInventory } from "./source-inventory.ts";
import { WorkspaceDependencies } from "./workspace-dependencies.ts";
import type {
  DependencyOptions,
  DependencyError,
} from "./workspace-dependencies.ts";
import { WorkspaceFiles } from "./workspace-files.ts";
import type { WorkspaceFileError } from "./workspace-files.ts";
import { WorkspaceSnapshots, snapshotTarget } from "./workspace-snapshots.ts";
import type { SnapshotError } from "./workspace-snapshots.ts";
import { WorkspaceSources } from "./workspace-sources.ts";
import type { SourceRequest, SourceError } from "./workspace-sources.ts";
import { WorkspaceState } from "./workspace-state.ts";
import type { WorkspaceStateError } from "./workspace-state.ts";

type PreparationError = CompositionError | SourceError;

export interface FreshRequest {
  readonly source: SourceRequest;
  readonly destination: string;
  readonly selection: SelectionRequest;
  readonly name: string;
}
export interface NamedWorkspaceRef {
  readonly sourceRoot: string;
  readonly name: string;
}
export interface SyncOptions extends DependencyOptions {
  readonly environment?: "preserve" | "copy-missing-local";
}
export interface NamedSyncOptions extends SyncOptions {
  readonly breakLock?: string;
}
export interface FreshOptions extends SyncOptions {
  readonly git?: "skip" | "initialize" | "commit";
}
export interface FreshWorkspace {
  readonly materialize: (
    options: FreshOptions
  ) => Effect.Effect<
    MaterializationReport,
    | PreparationError
    | ApplicationGitFailed
    | DestinationNotEmpty
    | EnvironmentInitializationFailed
    | MaterializationFailed
    | PlatformError.PlatformError
    | DependencyError
  >;
}
export interface NamedWorkspace {
  readonly watch: (
    options: SyncOptions
  ) => Stream.Stream<
    WatchEvent,
    Effect.Error<ReturnType<NamedWorkspace["sync"]>> | SourceWatchFailure
  >;
  readonly diff: Effect.Effect<
    DiffReport,
    | WorkspaceFileError
    | WorkspaceStateError
    | SnapshotError
    | DestinationNotEmpty
    | SourceChanged
    | WorkspaceUninitialized
  >;
  readonly check: (
    options?: Pick<DependencyOptions, "offline">
  ) => Effect.Effect<
    CheckReport,
    | PreparationError
    | WorkspaceFileError
    | WorkspaceStateError
    | DependencyError
    | DestinationNotEmpty
  >;
  readonly explain: (
    target?: string
  ) => Effect.Effect<ExplanationReport, PreparationError>;
  readonly sync: (
    options: NamedSyncOptions
  ) => Effect.Effect<
    MaterializationReport,
    | Effect.Error<ReturnType<FreshWorkspace["materialize"]>>
    | WorkspaceFileError
    | WorkspaceStateError
    | SnapshotError
  >;
}

export type WatchEvent =
  | { readonly _tag: "Synchronized"; readonly result: MaterializationReport }
  | {
      readonly _tag: "RefreshFailed";
      readonly error: Effect.Error<ReturnType<NamedWorkspace["sync"]>>;
    };

export class Workspaces extends Context.Service<
  Workspaces,
  {
    readonly existing: (request: {
      readonly root: string;
    }) => Effect.Effect<ExistingWorkspace>;
    readonly discover: (
      sourceRoot: string
    ) => Effect.Effect<
      readonly NamedWorkspaceRef[],
      PlatformError.PlatformError | InvalidComposition
    >;
    readonly fresh: (request: FreshRequest) => Effect.Effect<FreshWorkspace>;
    readonly named: (
      request: NamedWorkspaceRef
    ) => Effect.Effect<NamedWorkspace, InvalidComposition>;
  }
>()("create-next-hydra/Workspaces") {
  static readonly layer = Layer.effect(
    Workspaces,
    Effect.gen(function* () {
      const sources = yield* WorkspaceSources;
      const composition = yield* Composition;
      const inventory = yield* SourceInventory;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const state = yield* WorkspaceState;
      const workspaceFiles = yield* WorkspaceFiles;
      const dependencies = yield* WorkspaceDependencies;
      const snapshots = yield* WorkspaceSnapshots;
      const sourceChanges = yield* SourceChanges;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const shadcn = yield* Shadcn;
      const initialize = Effect.fn("Workspaces.initialize")(
        (request: FreshRequest) =>
          Effect.sync(() => {
            const destination = path.resolve(request.destination);
            const inspect = inspectInitialization(destination).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path)
            );
            return {
              materialize: Effect.fn("FreshWorkspace.materialize")(function* (
                options: FreshOptions
              ) {
                if (
                  request.source.kind === "working-tree" &&
                  destination === path.resolve(request.source.root)
                ) {
                  return yield* new InvalidComposition({
                    message: "Source and destination must differ",
                  });
                }
                yield* inspect;
                const prepared = yield* sources.use(request.source, (source) =>
                  composition.prepare({
                    name: request.name,
                    selection: request.selection,
                    source,
                  })
                );
                yield* inspect;
                const { files } = prepared;
                for (const file of files) {
                  if (yield* fs.exists(path.join(destination, file.target))) {
                    return yield* new DestinationNotEmpty({
                      directory: destination,
                    });
                  }
                }
                const environment = yield* planEnvironmentCopy(
                  destination,
                  files,
                  options.environment === "copy-missing-local" &&
                    request.source.kind === "working-tree"
                    ? yield* inventory.localEnvironment(request.source.root)
                    : []
                ).pipe(
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.provideService(Path.Path, path)
                );
                yield* fs
                  .makeDirectory(destination, { recursive: true })
                  .pipe(Effect.uninterruptible);
                const completedFiles: string[] = [];
                for (const file of files) {
                  yield* writeFile(destination, file, true).pipe(
                    Effect.provideService(FileSystem.FileSystem, fs),
                    Effect.provideService(Path.Path, path),
                    Effect.mapError(
                      (error) =>
                        new MaterializationFailed({
                          completedFiles: [...completedFiles],
                          diagnostic: Redacted.make(error),
                          directory: destination,
                          failedFile: file.target,
                        })
                    )
                  );
                  completedFiles.push(file.target);
                }
                const environmentFilesCreated = yield* copyEnvironment(
                  destination,
                  environment
                ).pipe(
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.provideService(Path.Path, path)
                );
                const dependencyResult = yield* dependencies.reconcile(
                  destination,
                  files,
                  options
                );
                const git =
                  options.git && options.git !== "skip"
                    ? yield* initializeApplicationGit(
                        destination,
                        options.git === "commit"
                      ).pipe(
                        Effect.provideService(
                          ChildProcessSpawner.ChildProcessSpawner,
                          processes
                        )
                      )
                    : undefined;
                const result: MaterializationReport = {
                  ...dependencyResult,
                  destination,
                  environmentFilesCreated,
                  files: files.map((file) => file.target),
                  instructions: prepared.instructions,
                  origins: files.map(({ target, origin }) => ({
                    origin,
                    target,
                  })),
                  removedFiles: [],
                };
                return git === undefined ? result : { ...result, git };
              }),
            };
          })
      );
      const fresh = Effect.fn("Workspaces.fresh")((request: FreshRequest) =>
        initialize(request)
      );
      const named = Effect.fn("Workspaces.named")(function* ({
        sourceRoot,
        name,
      }: NamedWorkspaceRef) {
        if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(name)) {
          return yield* new InvalidComposition({
            message:
              "Workspace name must contain 1–63 lowercase letters, digits or hyphens, beginning and ending with a letter or digit",
          });
        }
        const destination = path.resolve(sourceRoot, "workspaces", name);
        const definitionPath = path.join(destination, "next-hydra.json");
        const readDefinition = Effect.gen(function* () {
          const definition = yield* fs.readFileString(definitionPath);
          const parsed = yield* Schema.decodeEffect(
            Schema.fromJsonString(WorkspaceDefinition)
          )(definition, { onExcessProperty: "error" });
          return {
            definition,
            port: parsed.development?.port,
            selection: { addOns: parsed.addOns, providers: parsed.providers },
          };
        });
        const operations = {
          check: Effect.fn("NamedWorkspace.check")(function* (
            options: Pick<DependencyOptions, "offline"> = {}
          ) {
            return yield* state.withRead(
              { directory: destination, sourceRoot },
              (observation) =>
                Effect.gen(function* () {
                  const { definition, port, selection } = yield* readDefinition;
                  const prepared = yield* sources.use(
                    { kind: "working-tree", root: sourceRoot },
                    (source) =>
                      composition.prepare({ name, port, selection, source })
                  );
                  const preserved = yield* inspectInitialization(
                    destination,
                    definition
                  );
                  const output = yield* namedInitializationFiles(
                    prepared.files,
                    preserved
                  );
                  const files = output.filter(
                    (file) => file.target !== ".gitignore"
                  );
                  const changes = [
                    ...(yield* workspaceFiles.inspect(observation, files)),
                  ];
                  if (!preserved.has(".gitignore")) {
                    changes.push({ kind: "setting", target: ".gitignore" });
                  }
                  const dependencyState = yield* dependencies.inspect(
                    observation,
                    files,
                    options
                  );
                  if (
                    (yield* fs.readFileString(definitionPath)) !== definition
                  ) {
                    return yield* new SourceChanged({
                      paths: ["next-hydra.json"],
                    });
                  }
                  return {
                    ...dependencyState,
                    changes,
                    destination,
                    initialized: observation.initialized,
                    ready:
                      observation.initialized &&
                      changes.length === 0 &&
                      dependencyState.dependencies === "current",
                  };
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.provideService(Path.Path, path)
                )
            );
          }),
          diff: state
            .withRead(
              { directory: destination, sourceRoot },
              (observation) =>
                Effect.gen(function* () {
                  if (!observation.initialized) {
                    return yield* new WorkspaceUninitialized({
                      directory: destination,
                    });
                  }
                  if (!observation.snapshot) {
                    return yield* new SnapshotUnavailable({
                      directory: destination,
                    });
                  }
                  const pending =
                    observation.pending?.kind === "files"
                      ? observation.pending.files
                      : [];
                  const targets = [
                    ...new Set([
                      ...observation.entries.map((entry) => entry.target),
                      ...pending.map((entry) => entry.target),
                    ]),
                  ];
                  const owned = new Set([
                    ...targets,
                    ...pending.flatMap((entry) =>
                      entry.temporary === null ? [] : [entry.temporary]
                    ),
                  ]);
                  const unregisteredFiles = yield* listUnregisteredFiles(
                    destination,
                    owned
                  );
                  const { files, conflicts } = yield* workspaceFiles.read(
                    destination,
                    targets
                  );
                  const comparison = yield* snapshots.diff(
                    { directory: destination, sourceRoot },
                    observation.snapshot.commit,
                    files
                  );
                  return {
                    ...comparison,
                    conflicts,
                    incomplete:
                      observation.revision !== observation.snapshot.revision,
                    origins: observation.snapshot.origins.filter((file) =>
                      comparison.changes.some(
                        (change) => change.target === file.target
                      )
                    ),
                    snapshot: observation.snapshot.commit,
                    unregisteredFiles: unregisteredFiles.filter(
                      (target) =>
                        snapshotTarget(target) && !conflicts.includes(target)
                    ),
                  };
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.provideService(Path.Path, path)
                ),
              { allowIncomplete: true }
            )
            .pipe(Effect.withSpan("NamedWorkspace.diff")),
          explain: Effect.fn("NamedWorkspace.explain")(function* (
            target?: string
          ) {
            const selectedTarget =
              target === undefined ? undefined : yield* relativeFile(target);
            const { definition, port, selection } = yield* readDefinition;
            const prepared = yield* sources.use(
              { kind: "working-tree", root: sourceRoot },
              (source) => composition.prepare({ name, port, selection, source })
            );
            const files: FileExplanation[] = prepared.files
              .filter(
                (file) =>
                  !workspaceSetting(file.target) &&
                  (selectedTarget === undefined ||
                    file.target === selectedTarget)
              )
              .map(({ target: file, origin }) => ({ origin, target: file }));
            if (
              selectedTarget !== undefined &&
              workspaceSetting(selectedTarget) &&
              (yield* fs.exists(path.join(destination, selectedTarget))) &&
              (yield* fs.stat(path.join(destination, selectedTarget))).type ===
                "File"
            ) {
              files.push({
                origin: {
                  kind: "workspace-setting",
                  source: `workspaces/${name}/${selectedTarget}`,
                },
                target: selectedTarget,
              });
            }
            if (selectedTarget !== undefined && files.length === 0) {
              return yield* new InvalidComposition({
                message: `No selected composition file: ${selectedTarget}`,
              });
            }
            if ((yield* fs.readFileString(definitionPath)) !== definition) {
              return yield* new SourceChanged({ paths: ["next-hydra.json"] });
            }
            return { destination, files, sourceRoot: path.resolve(sourceRoot) };
          }),
          sync: Effect.fn("NamedWorkspace.sync")(function* <E = never>(
            options: NamedSyncOptions,
            environmentCopied: Effect.Effect<void> = Effect.void,
            observeInputs: (
              inputs: SourceInputs
            ) => Effect.Effect<boolean, E> = () => Effect.succeed(false)
          ): Effect.fn.Return<
            MaterializationReport,
            Effect.Error<ReturnType<NamedWorkspace["sync"]>> | E
          > {
            return yield* state.withWrite(
              { directory: destination, sourceRoot },
              (access) =>
                Effect.gen(function* () {
                  const { definition, port, selection } = yield* readDefinition;
                  const inspect = inspectInitialization(
                    destination,
                    definition
                  );
                  yield* dependencies.recover(access);
                  yield* workspaceFiles.recover(access);
                  yield* inspect;
                  const prepare = sources.use(
                    { kind: "working-tree", root: sourceRoot },
                    (source) =>
                      composition.prepare({ name, port, selection, source })
                  );
                  let prepared = yield* prepare;
                  // Watch may discover inputs beyond its connected roots. Subscribe
                  // and re-read them before applying any output from that discovery.
                  while (yield* observeInputs(prepared.inputs)) {
                    prepared = yield* prepare;
                  }
                  const preserved = yield* inspect;
                  const output = yield* namedInitializationFiles(
                    prepared.files,
                    preserved
                  );
                  // Ignore rules are seeded once and become workspace-owned settings.
                  const settings = output.filter(
                    (file) => file.target === ".gitignore"
                  );
                  const files = output.filter(
                    (file) => file.target !== ".gitignore"
                  );
                  const environment = yield* planEnvironmentCopy(
                    destination,
                    files,
                    options.environment === "copy-missing-local"
                      ? yield* inventory.localEnvironment(sourceRoot)
                      : []
                  );
                  const applied = yield* workspaceFiles.apply(access, files, [
                    ...settings.map((file) => file.target),
                    ...environment.map((file) => file.target),
                  ]);
                  for (const setting of settings) {
                    yield* access.initialize(
                      setting.target,
                      writeFile(destination, setting, true)
                    );
                  }
                  const environmentFilesCreated = yield* copyEnvironment(
                    destination,
                    environment,
                    access.initialize
                  );
                  yield* environmentCopied;
                  yield* inspect;
                  yield* applied.complete;
                  const dependencyState = yield* dependencies.reconcile(
                    destination,
                    files,
                    options,
                    access
                  );
                  const observation = yield* access.observation;
                  const captured = yield* workspaceFiles.capture(
                    destination,
                    observation.entries
                  );
                  const commit = yield* snapshots.capture(
                    { directory: destination, sourceRoot },
                    captured,
                    observation.snapshot?.commit
                  );
                  // Reobserve against the same applied fingerprints before the
                  // receipt selects these immutable bytes as its baseline.
                  yield* workspaceFiles.capture(
                    destination,
                    observation.entries
                  );
                  yield* access.publishSnapshot(commit, observation.revision);
                  return {
                    ...dependencyState,
                    destination,
                    environmentFilesCreated,
                    files: files.map((file) => file.target),
                    instructions: prepared.instructions,
                    origins: prepared.files
                      .filter(
                        (file) => workspaceSetting(file.target) === undefined
                      )
                      .map(({ target, origin }) => ({ origin, target })),
                    recoveryEvidence: access.recoveryEvidence,
                    removedFiles: applied.removedFiles,
                  };
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.provideService(Path.Path, path)
                ),
              options
            );
          }),
        };
        return {
          ...operations,
          watch: (options: SyncOptions) =>
            Stream.unwrap(
              Effect.gen(function* () {
                const coverage = (inputs: SourceInputs | null) => ({
                  files: [`workspaces/${name}/next-hydra.json`],
                  inputs,
                  root: path.resolve(sourceRoot),
                });
                const subscription = yield* sourceChanges.open(coverage(null));
                const pending = yield* Queue.dropping<undefined>(1);
                const copied = yield* Ref.make(false);
                let observedExternal = new Set<string>();
                const collector = yield* subscription.invalidations.pipe(
                  Stream.runForEach(() => Queue.offer(pending, undefined)),
                  Effect.andThen(
                    Effect.fail(
                      new SourceWatchFailure({
                        diagnostic: Redacted.make(
                          "Observation ended unexpectedly"
                        ),
                        path: sourceRoot,
                        phase: "observe",
                      })
                    )
                  ),
                  Effect.forkScoped
                );
                const synchronize = Effect.gen(function* () {
                  // Observe discoveries before reading any newly selected input.
                  // Failed preparation keeps this conservative scope for repair.
                  yield* subscription.update(coverage(null));
                  const inputs = yield* Ref.make<SourceInputs | null>(null);
                  const outcome = yield* operations
                    .sync(
                      {
                        ...options,
                        environment: (yield* Ref.get(copied))
                          ? "preserve"
                          : options.environment,
                      },
                      Ref.set(copied, true),
                      (prepared) =>
                        Effect.gen(function* () {
                          yield* Ref.set(inputs, prepared);
                          yield* subscription.update(coverage(prepared));
                          const external = prepared.files.filter(
                            (file) =>
                              file.startsWith("../") || path.isAbsolute(file)
                          );
                          const discovered = external.some(
                            (file) => !observedExternal.has(file)
                          );
                          observedExternal = new Set(external);
                          if (discovered) {
                            yield* Ref.set(inputs, null);
                            yield* subscription.update(coverage(null));
                          }
                          return discovered;
                        })
                    )
                    .pipe(
                      Effect.matchCauseEffect({
                        onFailure: (cause) => {
                          if (
                            Cause.hasDies(cause) ||
                            Cause.hasInterrupts(cause)
                          ) {
                            return Effect.failCause(cause);
                          }
                          const failure = Cause.findError(cause);
                          if (Result.isFailure(failure)) {
                            return Effect.failCause(failure.failure);
                          }
                          const error = failure.success;
                          if (error._tag === "SourceWatchFailure") {
                            return Effect.failCause(cause);
                          }
                          return Effect.succeed<WatchEvent>({
                            _tag: "RefreshFailed",
                            error,
                          });
                        },
                        onSuccess: (result) =>
                          Effect.succeed<WatchEvent>({
                            _tag: "Synchronized",
                            result,
                          }),
                      })
                    );
                  yield* subscription.update(coverage(yield* Ref.get(inputs)));
                  return outcome;
                });
                const subsequent = Effect.gen(function* () {
                  yield* Queue.take(pending);
                  yield* Effect.sleep("50 millis");
                  yield* Queue.clear(pending);
                  return yield* synchronize;
                });
                return Stream.concat(
                  Stream.fromEffect(synchronize),
                  Stream.fromEffectRepeat(subsequent)
                ).pipe(Stream.interruptWhen(Fiber.join(collector)));
              })
            ),
        };
      });
      const discover = Effect.fn("Workspaces.discover")(function* (
        sourceRoot: string
      ) {
        const root = path.resolve(sourceRoot);
        const references: NamedWorkspaceRef[] = [];
        for (const file of yield* inventory.list(root)) {
          const [directory, name, definition, extra] = file.split("/");
          if (
            directory === "workspaces" &&
            name &&
            !name.startsWith(".") &&
            definition === "next-hydra.json" &&
            extra === undefined
          ) {
            references.push({ name, sourceRoot: root });
          }
        }
        return EffectArray.sortWith(
          references,
          (reference) => reference.name,
          Order.String
        );
      });
      return Workspaces.of({
        discover,
        existing: ({ root }) =>
          existingWorkspace(root).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
            Effect.provideService(Shadcn, shadcn),
            Effect.provideService(WorkspaceDependencies, dependencies)
          ),
        fresh,
        named,
      });
    })
  );
}
