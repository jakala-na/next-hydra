import {
  Context,
  Effect,
  FileSystem,
  Layer,
  Path,
  Redacted,
  Ref,
  Stream,
} from "effect";
import type { PlatformError, Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { SourceAcquisitionFailed, SourceStorageRetained } from "./errors.ts";
import { confirmStopped } from "./process-group.ts";

export interface WorkingTree {
  readonly kind: "working-tree";
  readonly root: string;
}

export type SourceRequest =
  | WorkingTree
  | {
      readonly kind: "repository";
      readonly repository: string;
      readonly ref?: string;
    };
export type WorkspaceSource =
  | WorkingTree
  | {
      readonly kind: "repository";
      readonly root: string;
      readonly commit: string;
    };
export type SourceError =
  | PlatformError.PlatformError
  | SourceAcquisitionFailed
  | SourceStorageRetained;

export class WorkspaceSources extends Context.Service<
  WorkspaceSources,
  {
    readonly use: <A, E, R>(
      request: SourceRequest,
      use: (source: WorkspaceSource) => Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E | SourceError, Exclude<R, Scope.Scope>>;
  }
>()("create-next-hydra/WorkspaceSources") {
  static readonly layer = Layer.effect(
    WorkspaceSources,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      return WorkspaceSources.of({
        use: (request, use) =>
          Effect.gen(function* () {
            if (request.kind === "working-tree") {
              const root = path.resolve(request.root);
              yield* fs.access(root);
              return yield* Effect.scoped(use({ kind: "working-tree", root }));
            }
            if (process.platform === "win32" || request.ref?.startsWith("-")) {
              return yield* new SourceAcquisitionFailed({
                diagnostic: Redacted.make("Unsupported platform or revision"),
                phase: "validation",
              });
            }
            return yield* Effect.acquireUseRelease(
              Effect.gen(function* () {
                const directory = yield* fs.makeTempDirectory({
                  prefix: "hydra-source-",
                });
                return { active: yield* Ref.make(false), directory };
              }),
              (storage) =>
                Effect.gen(function* () {
                  const root = path.join(storage.directory, "checkout");
                  const git = Effect.fn("WorkspaceSources.git")(
                    (phase: string, args: readonly string[], cwd: string) =>
                      Effect.scoped(
                        Effect.uninterruptibleMask((restore) =>
                          Effect.gen(function* () {
                            yield* Ref.set(storage.active, true);
                            const handle = yield* processes
                              .spawn(
                                ChildProcess.make("git", args, {
                                  cwd,
                                  forceKillAfter: "100 millis",
                                  stderr: "ignore",
                                  stdin: "ignore",
                                })
                              )
                              .pipe(
                                Effect.tapError(() =>
                                  Ref.set(storage.active, false)
                                ),
                                Effect.mapError(
                                  (error) =>
                                    new SourceAcquisitionFailed({
                                      diagnostic: Redacted.make(error),
                                      phase,
                                    })
                                )
                              );
                            return yield* restore(
                              Effect.gen(function* () {
                                const [output, code] = yield* Effect.all(
                                  [
                                    Stream.mkString(
                                      Stream.decodeText(handle.stdout)
                                    ),
                                    handle.exitCode,
                                  ],
                                  { concurrency: "unbounded" }
                                );
                                if (code !== 0) {
                                  return yield* new SourceAcquisitionFailed({
                                    diagnostic: Redacted.make({
                                      exitCode: code,
                                    }),
                                    phase,
                                  });
                                }
                                return output.trim();
                              })
                            ).pipe(
                              Effect.mapError(
                                (error) =>
                                  new SourceAcquisitionFailed({
                                    diagnostic: Redacted.make(error),
                                    phase,
                                  })
                              ),
                              Effect.onExit(() =>
                                confirmStopped(handle).pipe(
                                  Effect.mapError(
                                    (error) =>
                                      new SourceAcquisitionFailed({
                                        diagnostic: Redacted.make(error),
                                        phase: "stop",
                                      })
                                  ),
                                  Effect.andThen(
                                    Ref.set(storage.active, false)
                                  ),
                                  Effect.onExit(() =>
                                    handle.unref.pipe(Effect.asVoid)
                                  )
                                )
                              )
                            );
                          })
                        )
                      )
                  );
                  yield* git(
                    "clone",
                    [
                      "clone",
                      ...(request.ref ? [] : ["--depth", "1"]),
                      "--",
                      request.repository,
                      root,
                    ],
                    storage.directory
                  );
                  if (request.ref) {
                    yield* git(
                      "checkout",
                      ["checkout", "--detach", request.ref],
                      root
                    );
                  }
                  const commit = yield* git(
                    "revision",
                    ["rev-parse", "HEAD"],
                    root
                  );
                  return yield* Effect.scoped(
                    use({ commit, kind: "repository", root })
                  );
                }),
              (storage) =>
                Effect.gen(function* () {
                  if (yield* Ref.get(storage.active)) {
                    return yield* new SourceStorageRetained({
                      directory: storage.directory,
                    });
                  }
                  yield* fs.remove(storage.directory, { recursive: true });
                })
            );
          }),
      });
    })
  );
}
