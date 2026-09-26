import { expect, it } from "@effect/vitest";
import {
  Cause,
  Console,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  PlatformError,
  Queue,
  Redacted,
  Schema,
  Stdio,
  Stream,
} from "effect";
import { TestClock, TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { ChildProcessSpawner } from "effect/unstable/process";
import { applyEdits, modify } from "jsonc-parser";

import { command } from "../src/commands.ts";
import { SourceChanges, SourceWatchFailure } from "../src/source-changes.ts";
import { Workspaces } from "../src/workspaces.ts";
import type { WatchEvent } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";
import {
  installedApplication,
  packageManager,
} from "./fixtures/package-manager.ts";
import { terminalInput } from "./fixtures/terminal.ts";
import { exampleFiles } from "./fixtures/workspace.ts";

const root = "/source/workspaces/configured-site";

it.effect(
  "Watch rereads an external artifact after connecting observation",
  () =>
    Effect.gen(function* () {
      const artifact = "/banner.json";
      const layer = yield* memoryWorkspace("application", {
        sourceChanges: Layer.effect(
          SourceChanges,
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            let connected = false;
            return SourceChanges.of({
              open: () =>
                Effect.succeed({
                  invalidations: Stream.never,
                  update: (coverage) =>
                    Effect.gen(function* () {
                      if (
                        connected ||
                        !coverage.inputs?.files.includes("../banner.json")
                      ) {
                        return;
                      }
                      // A save before readiness cannot produce an observer event.
                      const contents = yield* fs.readFileString(artifact);
                      yield* fs.writeFileString(
                        artifact,
                        applyEdits(
                          contents,
                          modify(
                            contents,
                            ["files", 0, "content"],
                            "export const banner = 'Saved before observation';\n",
                            {}
                          )
                        )
                      );
                      connected = true;
                    }).pipe(Effect.orDie),
                }),
            });
          })
        ),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const banner = (yield* exampleFiles("registry")).get("banner.json");
        if (!banner) {
          return yield* Effect.die("Missing authored registry artifact");
        }
        yield* fs.writeFile(artifact, banner);
        yield* fs.writeFileString(
          `${root}/next-hydra.json`,
          yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
            addOns: [artifact],
            providers: {},
          })
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        const [event] = yield* workspace
          .watch({ install: "skip" })
          .pipe(Stream.take(1), Stream.runCollect);
        expect(event?._tag).toBe("Synchronized");
        expect(yield* fs.readFileString(`${root}/apps/web/banner.ts`)).toBe(
          "export const banner = 'Saved before observation';\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect("Watch preserves defects when lock cleanup also fails", () =>
  Effect.gen(function* () {
    const defect = new Error("Unexpected materialization defect");
    const layer = yield* memoryWorkspace("application", {
      fileSystem: (fs) => ({
        ...fs,
        remove: (file, options) =>
          file === `${root}/.workspace-composition.lock`
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  method: "remove",
                  module: "FileSystem",
                  pathOrDescriptor: file,
                })
              )
            : fs.remove(file, options),
        writeFile: (file, content, options) =>
          file === `${root}/apps/web/layout.tsx`
            ? Effect.die(defect)
            : fs.writeFile(file, content, options),
      }),
      sourceChanges: Layer.succeed(
        SourceChanges,
        SourceChanges.of({
          open: () =>
            Effect.succeed({
              invalidations: Stream.never,
              update: () => Effect.void,
            }),
        })
      ),
    });
    yield* Effect.gen(function* () {
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: "/source",
      });
      const result = yield* workspace
        .watch({ install: "skip" })
        .pipe(Stream.take(1), Stream.runCollect, Effect.exit);
      expect(Exit.isFailure(result)).toBeTruthy();
      if (Exit.isFailure(result)) {
        expect(Cause.hasDies(result.cause)).toBeTruthy();
        expect(Cause.hasFails(result.cause)).toBeTruthy();
        expect(
          result.cause.reasons.some(
            (reason) => Cause.isDieReason(reason) && reason.defect === defect
          )
        ).toBeTruthy();
      }
    }).pipe(Effect.provide(layer));
  })
);

it.effect(
  "Watch bounds batching without waiting for saves to become quiet",
  () =>
    Effect.gen(function* () {
      const changes = yield* Queue.unbounded<undefined>();
      const results = yield* Queue.unbounded<WatchEvent>();
      const layer = yield* memoryWorkspace("application", {
        sourceChanges: Layer.succeed(
          SourceChanges,
          SourceChanges.of({
            open: () =>
              Effect.succeed({
                invalidations: Stream.fromQueue(changes),
                update: () => Effect.void,
              }),
          })
        ),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        const running = yield* workspace.watch({ install: "skip" }).pipe(
          Stream.runForEach((event) => Queue.offer(results, event)),
          Effect.forkChild
        );
        yield* Queue.take(results);
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        // Never give a trailing debounce a quiet period during this interval.
        for (let save = 0; save < 30; save += 1) {
          yield* fs.writeFileString(
            "/source/layout.tsx.template",
            template.replace("Hello", "Continuous saves")
          );
          yield* Queue.offer(changes, undefined);
          yield* TestClock.adjust("10 millis");
        }
        // Allow in-flight asynchronous hashing to finish, but do not advance
        // virtual time into a quiet period after the final notification.
        expect((yield* Queue.take(results))._tag).toBe("Synchronized");
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Continuous saves");
        yield* Fiber.interrupt(running);
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "Watch retains saves during installation and synchronizes the latest sources without overlapping writes",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<undefined>();
      const release = yield* Deferred.make<undefined>();
      const completed = yield* Deferred.make<undefined>();
      const changes = yield* Queue.unbounded<undefined>();
      const observation = Layer.succeed(
        SourceChanges,
        SourceChanges.of({
          open: () =>
            Effect.succeed({
              invalidations: Stream.fromQueue(changes),
              update: () => Effect.void,
            }),
        })
      );
      const layer = yield* memoryWorkspace("application", {
        processes: Layer.effect(
          ChildProcessSpawner.ChildProcessSpawner,
          packageManager(() =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(installedApplication(root))
            )
          )
        ),
        sourceChanges: observation,
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        const events: string[] = [];
        const running = yield* workspace.watch({}).pipe(
          Stream.tap((event) => Effect.sync(() => events.push(event._tag))),
          Stream.tap(() =>
            events.length === 1
              ? Deferred.succeed(completed, undefined)
              : Effect.void
          ),
          Stream.take(2),
          Stream.runDrain,
          Effect.forkChild
        );
        yield* Deferred.await(entered);
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Latest heading")
        );
        yield* Queue.offer(changes, undefined);
        const config = yield* fs.readFileString(
          "/source/apps/web/package.json"
        );
        yield* fs.writeFileString(
          "/source/apps/web/package.json",
          config.replace(
            '"private": true',
            '"private": true, "description": "latest configuration"'
          )
        );
        yield* Queue.offer(changes, undefined);
        yield* TestClock.adjust("1 second");
        expect(events).toEqual([]);
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Hello");
        yield* Deferred.succeed(release, undefined);
        yield* Deferred.await(completed);
        yield* TestClock.adjust("1 second");
        yield* Fiber.join(running);
        expect(events).toEqual(["Synchronized", "Synchronized"]);
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Latest heading");
        expect(
          yield* fs.readFileString(`${root}/apps/web/package.json`)
        ).toContain("latest configuration");
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "Watch reports a broken definition once and resumes when it is repaired",
  () =>
    Effect.gen(function* () {
      const changes = yield* Queue.unbounded<undefined>();
      const results = yield* Queue.unbounded<WatchEvent>();
      const layer = yield* memoryWorkspace("application", {
        sourceChanges: Layer.succeed(
          SourceChanges,
          SourceChanges.of({
            open: () =>
              Effect.succeed({
                invalidations: Stream.fromQueue(changes),
                update: () => Effect.void,
              }),
          })
        ),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const definition = yield* fs.readFileString(`${root}/next-hydra.json`);
        yield* fs.writeFileString(`${root}/next-hydra.json`, "unfinished edit");
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        const running = yield* workspace.watch({ install: "skip" }).pipe(
          Stream.runForEach((event) => Queue.offer(results, event)),
          Effect.forkChild
        );
        expect((yield* Queue.take(results))._tag).toBe("RefreshFailed");
        yield* TestClock.adjust("1 minute");
        expect(yield* Queue.clear(results)).toEqual([]);
        yield* fs.writeFileString(`${root}/next-hydra.json`, definition);
        yield* Queue.offer(changes, undefined);
        yield* TestClock.adjust("1 second");
        expect((yield* Queue.take(results))._tag).toBe("Synchronized");
        yield* Fiber.interrupt(running);
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Hello");
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "an observer failure stops Watch and joins active installation before releasing the lock",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<undefined>();
      const changes = yield* Queue.unbounded<undefined, SourceWatchFailure>();
      const layer = yield* memoryWorkspace("application", {
        processes: Layer.effect(
          ChildProcessSpawner.ChildProcessSpawner,
          packageManager(() =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Effect.never)
            )
          )
        ),
        sourceChanges: Layer.succeed(
          SourceChanges,
          SourceChanges.of({
            open: () =>
              Effect.succeed({
                invalidations: Stream.fromQueue(changes),
                update: () => Effect.void,
              }),
          })
        ),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        const running = yield* workspace
          .watch({})
          .pipe(Stream.runDrain, Effect.forkChild);
        yield* Deferred.await(entered);
        yield* Queue.fail(
          changes,
          new SourceWatchFailure({
            diagnostic: Redacted.make("disconnected"),
            path: "/source",
            phase: "observe",
          })
        );
        expect(yield* Fiber.join(running).pipe(Effect.flip)).toMatchObject({
          _tag: "SourceWatchFailure",
        });
        expect(
          yield* fs.exists(`${root}/.workspace-composition.lock`)
        ).toBeFalsy();
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Hello");
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "compose --watch refreshes from source and reports one result per synchronization",
  () =>
    Effect.gen(function* () {
      const reports = yield* Queue.unbounded<undefined>();
      const changes = yield* Queue.unbounded<undefined>();
      const layer = yield* memoryWorkspace("application", {
        sourceChanges: Layer.succeed(
          SourceChanges,
          SourceChanges.of({
            open: () =>
              Effect.succeed({
                invalidations: Stream.fromQueue(changes),
                update: () => Effect.void,
              }),
          })
        ),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const output = yield* Console.Console;
        let results = 0;
        const originalLog = output.log.bind(output);
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            output.log = () => {
              results += 1;
              Queue.offerUnsafe(reports, undefined);
            };
          }),
          () =>
            Effect.sync(() => {
              output.log = originalLog;
            })
        );
        const running = yield* Command.runWith(command("/source"), {
          version: "0.3.0",
        })(["compose", "configured-site", "--watch", "--no-install"]).pipe(
          Effect.forkChild
        );
        yield* Effect.raceFirst(Queue.take(reports), Fiber.join(running));
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Edited through CLI")
        );
        yield* Queue.offer(changes, undefined);
        yield* TestClock.adjust("1 second");
        yield* Effect.raceFirst(Queue.take(reports), Fiber.join(running));
        yield* Fiber.interrupt(running);
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Edited through CLI");
        expect(results).toBe(2);
        expect(
          yield* fs.exists(`${root}/.workspace-composition.lock`)
        ).toBeFalsy();
      }).pipe(
        Effect.provide([
          layer,
          TestConsole.layer,
          terminalInput("no"),
          Stdio.layerTest({
            stdinIsTerminal: Effect.succeed(false),
            stdoutIsTerminal: Effect.succeed(false),
          }),
          Layer.succeed(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make(() => Effect.die("Unexpected CLI process"))
          ),
        ])
      );
    })
);

it.effect(
  "Watch does not repeat completed environment copying after installation fails",
  () =>
    Effect.gen(function* () {
      const changes = yield* Queue.unbounded<undefined>();
      const results = yield* Queue.unbounded<WatchEvent>();
      const layer = yield* memoryWorkspace("application", {
        localEnvironment: [
          {
            source: "/source/local-environment/checkout.env.example",
            target: "apps/web/.env.local",
          },
        ],
        processes: Layer.effect(
          ChildProcessSpawner.ChildProcessSpawner,
          packageManager(() => Effect.succeed(1))
        ),
        sourceChanges: Layer.succeed(
          SourceChanges,
          SourceChanges.of({
            open: () =>
              Effect.succeed({
                invalidations: Stream.fromQueue(changes),
                update: () => Effect.void,
              }),
          })
        ),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        const running = yield* workspace
          .watch({ environment: "copy-missing-local" })
          .pipe(
            Stream.runForEach((event) => Queue.offer(results, event)),
            Effect.forkChild
          );
        expect((yield* Queue.take(results))._tag).toBe("RefreshFailed");
        expect(yield* fs.exists(`${root}/apps/web/.env.local`)).toBeTruthy();
        yield* fs.remove(`${root}/apps/web/.env.local`);
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Continued")
        );
        yield* Queue.offer(changes, undefined);
        yield* TestClock.adjust("1 second");
        expect((yield* Queue.take(results))._tag).toBe("RefreshFailed");
        yield* Fiber.interrupt(running);
        expect(yield* fs.exists(`${root}/apps/web/.env.local`)).toBeFalsy();
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Continued");
      }).pipe(Effect.provide(layer));
    })
);
