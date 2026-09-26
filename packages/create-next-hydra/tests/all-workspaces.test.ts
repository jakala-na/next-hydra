import { expect, it } from "@effect/vitest";
import {
  Console,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Queue,
  Redacted,
  Stdio,
  Stream,
} from "effect";
import { TestClock, TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { ChildProcessSpawner } from "effect/unstable/process";

import { command } from "../src/commands.ts";
import { SourceChanges, SourceWatchFailure } from "../src/source-changes.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";
import {
  installedApplication,
  packageManager,
} from "./fixtures/package-manager.ts";
import { terminalInput } from "./fixtures/terminal.ts";

const terminal = Layer.mergeAll(
  terminalInput("no"),
  Stdio.layerTest({
    stdinIsTerminal: Effect.succeed(false),
    stdoutIsTerminal: Effect.succeed(false),
  }),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die("Unexpected CLI process"))
  )
);

it.effect(
  "compose --all finishes healthy workspaces before reporting failed selections",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove("/source/workspaces/enhanced-site/next-hydra.json");
        yield* fs.writeFileString(
          "/source/workspaces/configured-site/next-hydra.json",
          "unfinished edit"
        );
        const failure = yield* Command.runWith(command("/source"), {
          version: "0.3.0",
        })(["compose", "--all", "--no-install"]).pipe(Effect.flip);
        expect(failure).toMatchObject({
          _tag: "WorkspaceBatchFailed",
          names: ["configured-site"],
        });
        expect(
          yield* fs.exists(
            "/source/workspaces/configured-site/apps/web/layout.tsx"
          )
        ).toBeFalsy();
        expect(
          yield* fs.readFileString(
            "/source/workspaces/editorial-site/apps/web/layout.tsx"
          )
        ).toContain("Hello");
      }).pipe(Effect.provide([layer, terminal, TestConsole.layer]));
    })
);

it.effect(
  "compose --all --watch keeps healthy workspaces current while another definition needs repair",
  () =>
    Effect.gen(function* () {
      const changes = new Map<string, Queue.Queue<undefined>>();
      const reports = yield* Queue.unbounded<readonly unknown[]>();
      const output = yield* TestConsole.make;
      const layer = yield* memoryWorkspace("application", {
        sourceChanges: Layer.succeed(
          SourceChanges,
          SourceChanges.of({
            open: (coverage) =>
              Effect.gen(function* () {
                const pending = yield* Queue.unbounded<undefined>();
                changes.set(coverage.files[0] ?? "", pending);
                return {
                  invalidations: Stream.fromQueue(pending),
                  update: () => Effect.void,
                };
              }),
          })
        ),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const configured = "/source/workspaces/configured-site";
        const preview = "/source/workspaces/editorial-site";
        yield* fs.remove("/source/workspaces/enhanced-site/next-hydra.json");
        const definition = yield* fs.readFileString(
          `${configured}/next-hydra.json`
        );
        yield* fs.writeFileString(
          `${configured}/next-hydra.json`,
          "unfinished edit"
        );
        const running = yield* Command.runWith(command("/source"), {
          version: "0.3.0",
        })(["compose", "--all", "--watch", "--no-install"]).pipe(
          Effect.forkChild
        );
        const next = Effect.raceFirst(Queue.take(reports), Fiber.join(running));
        yield* next;
        yield* next;
        expect(
          yield* fs.exists(`${configured}/apps/web/layout.tsx`)
        ).toBeFalsy();
        expect(
          yield* fs.readFileString(`${preview}/apps/web/layout.tsx`)
        ).toContain("Hello");

        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Updated in parallel")
        );
        yield* Effect.forEach(changes.values(), (pending) =>
          Queue.offer(pending, undefined)
        );
        yield* TestClock.adjust("1 second");
        yield* next;
        yield* next;
        expect(
          yield* fs.readFileString(`${preview}/apps/web/layout.tsx`)
        ).toContain("Updated in parallel");

        yield* fs.writeFileString(`${configured}/next-hydra.json`, definition);
        const pending = changes.get(
          "workspaces/configured-site/next-hydra.json"
        );
        if (!pending) {
          return yield* Effect.die(
            "Expected observation for the broken definition"
          );
        }
        yield* Queue.offer(pending, undefined);
        yield* TestClock.adjust("1 second");
        yield* next;
        expect(
          yield* fs.readFileString(`${configured}/apps/web/layout.tsx`)
        ).toContain("Updated in parallel");
        yield* Fiber.interrupt(running);
        expect([
          yield* fs.exists(`${configured}/.workspace-composition.lock`),
          yield* fs.exists(`${preview}/.workspace-composition.lock`),
        ]).toEqual([false, false]);
      }).pipe(
        Effect.provide([
          layer,
          terminal,
          Layer.succeed(Console.Console, {
            ...output,
            error: (...values) => {
              Queue.offerUnsafe(reports, values);
            },
            log: (...values) => {
              Queue.offerUnsafe(reports, values);
            },
          }),
        ])
      );
    })
);

it.effect(
  "all Watch sessions progress independently and close on a fatal observer failure",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<undefined>();
      const reports = yield* Queue.unbounded<undefined>();
      const changes = new Map<
        string,
        Queue.Queue<undefined, SourceWatchFailure>
      >();
      const active = new Set<string>();
      let stoppedWhileLocked = false;
      const configured = "/source/workspaces/configured-site";
      const editorial = "/source/workspaces/editorial-site";
      const output = yield* TestConsole.make;
      const layer = yield* memoryWorkspace("application", {
        processes: Layer.effect(
          ChildProcessSpawner.ChildProcessSpawner,
          packageManager((directory) =>
            directory === configured
              ? Deferred.succeed(entered, undefined).pipe(
                  Effect.andThen(Effect.never),
                  Effect.ensuring(
                    Effect.gen(function* () {
                      const fs = yield* FileSystem.FileSystem;
                      stoppedWhileLocked = yield* fs
                        .exists(`${configured}/.workspace-composition.lock`)
                        .pipe(Effect.orDie);
                    })
                  )
                )
              : installedApplication(directory)
          )
        ),
        sourceChanges: Layer.succeed(
          SourceChanges,
          SourceChanges.of({
            open: (coverage) =>
              Effect.gen(function* () {
                const key = coverage.files[0] ?? "";
                const pending = yield* Queue.unbounded<
                  undefined,
                  SourceWatchFailure
                >();
                changes.set(key, pending);
                active.add(key);
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => {
                    active.delete(key);
                  })
                );
                return {
                  invalidations: Stream.fromQueue(pending),
                  update: () => Effect.void,
                };
              }),
          })
        ),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove("/source/workspaces/enhanced-site/next-hydra.json");
        const running = yield* Command.runWith(command("/source"), {
          version: "0.3.0",
        })(["compose", "--all", "--watch"]).pipe(Effect.forkChild);
        yield* Effect.raceFirst(Deferred.await(entered), Fiber.join(running));
        yield* Effect.raceFirst(Queue.take(reports), Fiber.join(running));
        expect(
          yield* fs.readFileString(`${editorial}/apps/web/layout.tsx`)
        ).toContain("Hello");
        const pending = changes.get(
          "workspaces/editorial-site/next-hydra.json"
        );
        if (!pending) {
          return yield* Effect.die("Expected the healthy workspace's observer");
        }
        yield* Queue.fail(
          pending,
          new SourceWatchFailure({
            diagnostic: Redacted.make("disconnected"),
            path: "/source",
            phase: "observe",
          })
        );
        expect(yield* Fiber.join(running).pipe(Effect.flip)).toMatchObject({
          _tag: "SourceWatchFailure",
        });
        expect(stoppedWhileLocked).toBeTruthy();
        expect(active.size).toBe(0);
        expect([
          yield* fs.exists(`${configured}/.workspace-composition.lock`),
          yield* fs.exists(`${editorial}/.workspace-composition.lock`),
        ]).toEqual([false, false]);
      }).pipe(
        Effect.provide([
          layer,
          terminal,
          Layer.succeed(Console.Console, {
            ...output,
            log: () => {
              Queue.offerUnsafe(reports, undefined);
            },
          }),
        ])
      );
    })
);
