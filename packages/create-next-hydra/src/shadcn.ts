import { fileURLToPath } from "node:url";

import {
  Context,
  Effect,
  FileSystem,
  Layer,
  Path,
  Redacted,
  Schema,
} from "effect";
import type { PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import {
  getRegistriesConfig,
  getRegistryItems,
  loadRegistry,
  loadRegistryItem,
} from "shadcn/registry";
import type { RegistryItem } from "shadcn/schema";

import { RegistryFailure, RegistryWorkerFailure } from "./errors.ts";
import { confirmStopped, groupExists } from "./process-group.ts";
import { OutcomeJson, RequestJson } from "./shadcn-protocol.ts";
import { stopped, writing } from "./staging.ts";
import type { RegistryInstallation } from "./staging.ts";

type LoadOptions = Parameters<typeof loadRegistry>[0];
export type RegistryCatalog = Omit<
  Awaited<ReturnType<typeof loadRegistry>>,
  "items"
> & { readonly items: readonly RegistryItem[] };

export class Shadcn extends Context.Service<
  Shadcn,
  {
    readonly getRegistryItems: (
      references: readonly string[],
      cwd: string
    ) => Effect.Effect<
      Awaited<ReturnType<typeof getRegistryItems>>,
      RegistryFailure
    >;
    readonly loadRegistry: (
      options: LoadOptions
    ) => Effect.Effect<
      Awaited<ReturnType<typeof loadRegistry>>,
      RegistryFailure
    >;
    readonly loadRegistryItem: (
      name: string,
      options: LoadOptions
    ) => Effect.Effect<
      Awaited<ReturnType<typeof loadRegistryItem>>,
      RegistryFailure
    >;
    readonly install: (
      staging: RegistryInstallation,
      entries: readonly string[],
      overwrite?: boolean
    ) => Effect.Effect<
      void,
      | RegistryFailure
      | RegistryWorkerFailure
      | PlatformError.PlatformError
      | Schema.SchemaError
    >;
  }
>()("create-next-hydra/Shadcn") {
  static layer = (worker = new URL("shadcn-worker.js", import.meta.url)) =>
    Layer.effect(
      Shadcn,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        return Shadcn.of({
          getRegistryItems: (references, cwd) =>
            Effect.tryPromise({
              catch: (error) =>
                new RegistryFailure({
                  diagnostic: Redacted.make(
                    error instanceof Error
                      ? error.message
                      : "Registry acquisition failed"
                  ),
                  operation: "acquire registry artifacts",
                }),
              try: async () =>
                await getRegistryItems([...references], {
                  config: await getRegistriesConfig(cwd),
                }),
            }).pipe(Effect.uninterruptible),
          install: Effect.fn("Shadcn.install")(function* (
            staging,
            entries,
            overwrite = true
          ) {
            if (process.platform === "win32") {
              return yield* new RegistryWorkerFailure({ phase: "launch" });
            }
            const requestPath = path.join(staging.control, "request.json");
            const resultPath = path.join(staging.control, "result.json");
            const request = yield* Schema.encodeEffect(RequestJson)({
              application: staging.application,
              entries,
              overwrite,
            });
            yield* fs
              .writeFileString(requestPath, request, { mode: 0o600 })
              .pipe(Effect.uninterruptible);
            yield* Effect.scoped(
              Effect.uninterruptibleMask((restore) =>
                Effect.gen(function* () {
                  yield* writing(staging);
                  const handle = yield* spawner
                    .spawn(
                      ChildProcess.make(
                        process.execPath,
                        [fileURLToPath(worker), requestPath, resultPath],
                        {
                          cwd: staging.application,
                          forceKillAfter: "100 millis",
                          stderr: "ignore",
                          stdin: "ignore",
                          stdout: "ignore",
                        }
                      )
                    )
                    .pipe(
                      Effect.tapError(() => stopped(staging)),
                      Effect.mapError(
                        () => new RegistryWorkerFailure({ phase: "launch" })
                      )
                    );
                  yield* restore(
                    Effect.gen(function* () {
                      const code = yield* handle.exitCode.pipe(
                        Effect.mapError(
                          () => new RegistryWorkerFailure({ phase: "exit" })
                        )
                      );
                      if (
                        code !== 0 ||
                        (yield* groupExists(handle.pid).pipe(
                          Effect.mapError(
                            () => new RegistryWorkerFailure({ phase: "stop" })
                          )
                        ))
                      ) {
                        return yield* new RegistryWorkerFailure({
                          phase: "exit",
                        });
                      }
                    })
                  ).pipe(
                    Effect.onExit(() =>
                      confirmStopped(handle).pipe(
                        Effect.mapError(
                          () => new RegistryWorkerFailure({ phase: "stop" })
                        ),
                        Effect.andThen(stopped(staging)),
                        // Prevent an unbounded second termination attempt by the process scope.
                        Effect.onExit(() => handle.unref.pipe(Effect.asVoid))
                      )
                    )
                  );
                })
              )
            );
            if ((yield* fs.stat(resultPath)).size > 65_536) {
              return yield* new RegistryWorkerFailure({ phase: "protocol" });
            }
            const outcome = yield* fs.readFileString(resultPath).pipe(
              Effect.flatMap(Schema.decodeEffect(OutcomeJson)),
              Effect.mapError(
                () => new RegistryWorkerFailure({ phase: "protocol" })
              )
            );
            if (outcome._tag === "RegistryFailure") {
              return yield* new RegistryFailure({
                diagnostic: Redacted.make(outcome.diagnostic),
                operation: "install registry items",
              });
            }
            if (outcome._tag === "WorkerDefect") {
              return yield* Effect.die({
                diagnostic: Redacted.make(outcome.diagnostic),
                message: "Registry worker defect",
              });
            }
          }),
          // The upstream read API has no cancellation signal. Join before releasing inputs.
          loadRegistry: (options) =>
            Effect.tryPromise({
              catch: (error) =>
                new RegistryFailure({
                  diagnostic: Redacted.make(
                    error instanceof Error
                      ? error.message
                      : "Registry loading failed"
                  ),
                  operation: "load registry",
                }),
              try: async () => await loadRegistry(options),
            }).pipe(Effect.uninterruptible),
          loadRegistryItem: (name, options) =>
            Effect.tryPromise({
              catch: (error) =>
                new RegistryFailure({
                  diagnostic: Redacted.make(
                    error instanceof Error
                      ? error.message
                      : "Registry hydration failed"
                  ),
                  operation: "hydrate registry item",
                }),
              try: async () => await loadRegistryItem(name, options),
            }).pipe(Effect.uninterruptible),
        });
      })
    );
}
