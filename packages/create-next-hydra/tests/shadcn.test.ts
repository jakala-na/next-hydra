import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Path,
  PlatformError,
  Redacted,
  Schema,
} from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import { RegistryFailure, StagingRetained } from "../src/errors.ts";
import { Shadcn } from "../src/shadcn.ts";
import { withStaging } from "../src/staging.ts";
import { memoryFileSystem } from "./fixtures/memory-file-system.ts";

const platform = NodeServices.layer;
const writer = Shadcn.layer(
  new URL("fixtures/active-writer.ts", import.meta.url)
).pipe(Layer.provide(platform));

it.effect("releases staging when the registry worker cannot launch", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const adapter = yield* Shadcn;
    const allocated = yield* Deferred.make<string>();
    const outcome = yield* withStaging((staging) =>
      Effect.gen(function* () {
        yield* Deferred.succeed(allocated, staging.root);
        yield* adapter.install(staging, []);
      })
    ).pipe(Effect.flip);
    expect(yield* fs.exists(yield* Deferred.await(allocated))).toBeFalsy();
    expect(outcome).toMatchObject({
      _tag: "RegistryWorkerFailure",
      phase: "launch",
    });
  }).pipe(
    Effect.provide(
      Shadcn.layer().pipe(
        Layer.provide(
          Layer.succeed(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make(() =>
              Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  method: "spawn",
                  module: "ChildProcess",
                })
              )
            )
          )
        ),
        Layer.provideMerge(memoryFileSystem(new Map())),
        Layer.provideMerge(Path.layer)
      )
    )
  )
);

it.live(
  "joins an interrupted registry writer before releasing its staging files",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const adapter = yield* Shadcn;
      const allocated = yield* Deferred.make<string>();
      const fiber = yield* withStaging((staging) =>
        Effect.gen(function* () {
          yield* Deferred.succeed(allocated, staging.root);
          yield* adapter.install(staging, []);
        })
      ).pipe(Effect.forkChild);
      const root = yield* Deferred.await(allocated);
      yield* Effect.gen(function* () {
        while (!(yield* fs.exists(`${root}/application/active`))) {
          yield* Effect.sleep("10 millis");
        }
      }).pipe(Effect.timeout("5 seconds"));
      yield* Fiber.interrupt(fiber);
      expect(yield* fs.exists(root)).toBeFalsy();
    }).pipe(Effect.provide(Layer.merge(platform, writer)))
);

it.live(
  "keeps library diagnostics private while reporting a registry rejection",
  () =>
    Effect.gen(function* () {
      const adapter = yield* Shadcn;
      const error = yield* withStaging((staging) =>
        adapter.install(staging, [])
      ).pipe(Effect.flip);
      expect(error).toBeInstanceOf(RegistryFailure);
      if (Schema.is(RegistryFailure)(error)) {
        expect(Redacted.value(error.diagnostic)).toBe(
          "fixture token=private-value"
        );
        expect(JSON.stringify(error)).not.toContain("private-value");
      }
    }).pipe(
      Effect.provide(
        Shadcn.layer(
          new URL("fixtures/rejected-install.ts", import.meta.url)
        ).pipe(Layer.provideMerge(platform))
      )
    )
);

it.live(
  "retains staging and interruption when stopping a writer cannot be confirmed",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const allocated = yield* Deferred.make<string>();
      const started =
        yield* Deferred.make<ChildProcessSpawner.ChildProcessHandle>();
      const failingStop = Layer.effect(
        ChildProcessSpawner.ChildProcessSpawner,
        Effect.gen(function* () {
          const real = yield* ChildProcessSpawner.ChildProcessSpawner;
          return ChildProcessSpawner.make((command) =>
            Effect.gen(function* () {
              const handle = yield* real.spawn(command);
              yield* Deferred.succeed(started, handle);
              return ChildProcessSpawner.makeHandle({
                ...handle,
                kill: () =>
                  Effect.fail(
                    PlatformError.systemError({
                      _tag: "PermissionDenied",
                      method: "kill",
                      module: "ChildProcess",
                    })
                  ),
              });
            })
          );
        })
      ).pipe(Layer.provide(platform));
      const adapter = Shadcn.layer(
        new URL("fixtures/active-writer.ts", import.meta.url)
      ).pipe(Layer.provide(failingStop), Layer.provide(platform));
      const fiber = yield* withStaging((staging) =>
        Effect.gen(function* () {
          yield* Deferred.succeed(allocated, staging.root);
          const service = yield* Shadcn;
          yield* service.install(staging, []);
        })
      ).pipe(Effect.provide(adapter), Effect.forkChild);
      const root = yield* Deferred.await(allocated);
      const handle = yield* Deferred.await(started);
      // The test owns the real process; the injected capability only denies the adapter's stop.
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* handle.kill({ forceKillAfter: "100 millis" });
          if (!(yield* handle.isRunning)) {
            yield* fs.remove(root, { recursive: true });
          }
        }).pipe(Effect.orDie)
      );
      yield* Effect.gen(function* () {
        while (!(yield* fs.exists(`${root}/application/active`))) {
          yield* Effect.sleep("10 millis");
        }
      }).pipe(Effect.timeout("5 seconds"));
      yield* Fiber.interrupt(fiber);
      const outcome = yield* Fiber.await(fiber);
      expect(Exit.isFailure(outcome)).toBeTruthy();
      if (Exit.isFailure(outcome)) {
        expect(Cause.hasInterrupts(outcome.cause)).toBeTruthy();
        expect(
          outcome.cause.reasons.some(
            (reason) =>
              Cause.isFailReason(reason) &&
              Schema.is(StagingRetained)(reason.error)
          )
        ).toBeTruthy();
      }
      expect(yield* fs.exists(`${root}/application/active`)).toBeTruthy();
    }).pipe(Effect.provide(platform))
);
