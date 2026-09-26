import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Path,
  PlatformError,
  Ref,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { describe } from "vitest";

import { Composition } from "../src/composition.ts";
import { Shadcn } from "../src/shadcn.ts";
import { SourceChanges } from "../src/source-changes.ts";
import { SourceInventory } from "../src/source-inventory.ts";
import { WorkspaceDependencies } from "../src/workspace-dependencies.ts";
import { WorkspaceFiles } from "../src/workspace-files.ts";
import { WorkspaceSnapshots } from "../src/workspace-snapshots.ts";
import { WorkspaceSources } from "../src/workspace-sources.ts";
import { WorkspaceState } from "../src/workspace-state.ts";
import { Workspaces } from "../src/workspaces.ts";
import { fixture } from "./fixtures/workspace.ts";

const platform = NodeServices.layer;
const registry = Shadcn.layer(
  new URL("../src/shadcn-worker.ts", import.meta.url)
);
const composition = Composition.layer.pipe(
  Layer.provide(registry),
  Layer.provide(SourceInventory.layer),
  Layer.provide(platform)
);

describe.each([false, true])("stop denied: %s", (denyStop) => {
  it.live(
    "retains installation evidence on interruption",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const real = yield* ChildProcessSpawner.ChildProcessSpawner;
        const writer = yield* path.fromFileUrl(
          new URL("fixtures/install-writer.ts", import.meta.url)
        );
        const runningHandle =
          yield* Ref.make<ChildProcessSpawner.ChildProcessHandle | null>(null);
        const installer = Layer.succeed(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make((command) =>
            Effect.gen(function* () {
              if (
                command._tag !== "StandardCommand" ||
                command.command !== "pnpm" ||
                command.args.includes("--version")
              ) {
                return yield* real.spawn(command);
              }
              const handle = yield* real.spawn(
                ChildProcess.make(process.execPath, [writer], {
                  cwd: command.options.cwd,
                  forceKillAfter: "100 millis",
                  stderr: "ignore",
                  stdout: "ignore",
                })
              );
              yield* Ref.set(runningHandle, handle);
              // This outer test scope, not the simulated failed adapter, owns final cleanup.
              return ChildProcessSpawner.makeHandle({
                ...handle,
                kill: (options) =>
                  denyStop
                    ? Effect.fail(
                        PlatformError.systemError({
                          _tag: "PermissionDenied",
                          method: "kill",
                          module: "ChildProcess",
                        })
                      )
                    : handle.kill(options),
              });
            })
          )
        );
        const api = Workspaces.layer.pipe(
          Layer.provide([
            registry,
            WorkspaceState.layer,
            SourceChanges.layer,
            WorkspaceSnapshots.layer,
            WorkspaceFiles.layer,
            WorkspaceDependencies.layer,
          ]),
          Layer.provide(composition),
          Layer.provide(WorkspaceSources.layer),
          Layer.provide(SourceInventory.layer),
          Layer.provide(installer),
          Layer.provide(platform)
        );
        const { source } = yield* fixture("application");
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            const handle = yield* Ref.get(runningHandle);
            if (handle && (yield* handle.isRunning)) {
              yield* handle.kill({ forceKillAfter: "100 millis" });
            }
          }).pipe(Effect.orDie)
        );
        const directory = `${source}/workspaces/configured-site`;
        const workspace = yield* Workspaces.pipe(
          Effect.flatMap((service) =>
            service.named({ name: "configured-site", sourceRoot: source })
          ),
          Effect.provide(api)
        );
        const running = yield* workspace.sync({}).pipe(Effect.forkScoped);
        yield* Effect.gen(function* () {
          while (!(yield* fs.exists(`${directory}/node_modules/child-ready`))) {
            yield* Effect.sleep("10 millis");
          }
        }).pipe(Effect.timeout("10 seconds"));
        yield* Fiber.interrupt(running);
        const outcome = yield* Fiber.await(running);
        expect(
          Exit.isFailure(outcome) && Cause.hasInterrupts(outcome.cause)
        ).toBeTruthy();
        expect(
          yield* fs.exists(`${directory}/.workspace-composition.lock`)
        ).toBe(denyStop);
        const retry = Workspaces.pipe(
          Effect.flatMap((service) =>
            service.named({ name: "configured-site", sourceRoot: source })
          ),
          Effect.flatMap((next) => next.sync({ install: "skip" })),
          Effect.provide(Layer.fresh(api))
        );
        if (denyStop) {
          const blocked = yield* retry.pipe(Effect.flip);
          if (blocked._tag !== "WorkspaceLockAuthorizationRequired") {
            return yield* Effect.die("Expected lock authorization request");
          }
          // Breaking coordination must not falsely mark an orphaned install stopped.
          expect(
            yield* workspace
              .sync({ breakLock: blocked.token, install: "skip" })
              .pipe(Effect.flip)
          ).toMatchObject({ _tag: "WorkspaceRecoveryRequired" });
        } else {
          expect(yield* retry).toMatchObject({ dependencies: "pending" });
          expect(yield* workspace.check()).toMatchObject({ ready: false });
        }
      }).pipe(Effect.provide(platform)),
    { timeout: 30_000 }
  );
});
