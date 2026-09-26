import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import {
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Queue,
  Schema,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { applyEdits, modify } from "jsonc-parser";
import { describe } from "vitest";

import { Workspaces } from "../src/workspaces.ts";
import type { WatchEvent } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";
import {
  installedApplication,
  packageManager,
} from "./fixtures/package-manager.ts";
import { exampleFiles, fixture } from "./fixtures/workspace.ts";

it.live(
  "Watch follows declared nested packages and discovers newly added package manifests",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("package-layout");
      const workspace = yield* (yield* Workspaces).named({
        name: "palette",
        sourceRoot: source,
      });
      const events = yield* Queue.unbounded<WatchEvent>();
      const running = yield* workspace.watch({ install: "skip" }).pipe(
        Stream.runForEach((event) => Queue.offer(events, event)),
        Effect.forkScoped
      );
      const next = Queue.take(events).pipe(Effect.timeout("10 seconds"));
      expect((yield* next)._tag).toBe("Synchronized");
      yield* fs.copyFile(
        `${source}/modules/design/colors/index.ts`,
        `${source}/modules/design/colors/palette.ts`
      );
      expect((yield* next)._tag).toBe("Synchronized");
      expect(
        yield* fs.readFileString(
          `${source}/workspaces/palette/modules/design/colors/palette.ts`
        )
      ).toBe('export const color = "blue";\n');

      // A newly discovered duplicate is a composition error, not a silent stale catalog.
      yield* fs.makeDirectory(`${source}/modules/duplicate`);
      yield* fs.copyFile(
        `${source}/unlisted/package.json`,
        `${source}/modules/duplicate/package.json`
      );
      expect(yield* next).toMatchObject({
        _tag: "RefreshFailed",
        error: {
          _tag: "InvalidComposition",
          message: "Duplicate package name: @example/colors",
        },
      });
      yield* Fiber.interrupt(running);
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    ),
  { timeout: 30_000 }
);

it.live(
  "Watch retains an external artifact edit during its first installation",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<undefined>();
      const release = yield* Deferred.make<undefined>();
      const installer = Layer.effect(
        ChildProcessSpawner.ChildProcessSpawner,
        Effect.gen(function* () {
          const real = yield* ChildProcessSpawner.ChildProcessSpawner;
          const pnpm = yield* packageManager((directory) =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(installedApplication(directory))
            )
          );
          return ChildProcessSpawner.make((command) =>
            command._tag === "StandardCommand" && command.command === "pnpm"
              ? pnpm.spawn(command)
              : real.spawn(command)
          );
        })
      );
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { source, root } = yield* fixture("application");
        const artifact = `${root}/banner.json`;
        const banner = (yield* exampleFiles("registry")).get("banner.json");
        if (!banner) {
          return yield* Effect.die("Missing authored registry artifact");
        }
        yield* fs.writeFile(artifact, banner);
        const directory = `${source}/workspaces/configured-site`;
        yield* fs.writeFileString(
          `${directory}/next-hydra.json`,
          yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
            addOns: [artifact],
            providers: {},
          })
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: source,
        });
        const events = yield* Queue.unbounded<WatchEvent>();
        const running = yield* workspace.watch({}).pipe(
          Stream.runForEach((event) => Queue.offer(events, event)),
          Effect.forkScoped
        );
        yield* Deferred.await(entered).pipe(Effect.timeout("10 seconds"));
        const item = yield* fs.readFileString(artifact);
        yield* fs.writeFileString(
          artifact,
          applyEdits(
            item,
            modify(
              item,
              ["files", 0, "content"],
              "export const banner = 'Saved during installation';\n",
              {}
            )
          )
        );
        yield* Deferred.succeed(release, undefined);
        const next = Queue.take(events).pipe(Effect.timeout("10 seconds"));
        expect((yield* next)._tag).toBe("Synchronized");
        expect((yield* next)._tag).toBe("Synchronized");
        expect(
          yield* fs.readFileString(`${directory}/apps/web/banner.ts`)
        ).toBe("export const banner = 'Saved during installation';\n");
        yield* Fiber.interrupt(running);
      }).pipe(
        Effect.provide(
          liveWorkspace.pipe(
            Layer.provide(installer),
            Layer.provideMerge(NodeServices.layer)
          )
        )
      );
    }),
  { timeout: 30_000 }
);

describe.each(["inside", "outside"] as const)(
  "local registry artifact %s the checkout",
  (location) => {
    it.live(
      "refreshes its applied files when the artifact changes",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { source, root } = yield* fixture("editorial");
          const artifact = `${location === "inside" ? source : root}/banner.json`;
          const banner = (yield* exampleFiles("registry")).get("banner.json");
          if (!banner) {
            return yield* Effect.die("Missing authored registry artifact");
          }
          yield* fs.writeFile(artifact, banner);
          yield* fs.writeFileString(
            `${source}/workspaces/editorial-site/next-hydra.json`,
            yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
              addOns: [artifact],
              providers: {},
            })
          );
          const workspace = yield* (yield* Workspaces).named({
            name: "editorial-site",
            sourceRoot: source,
          });
          const events = yield* Queue.unbounded<WatchEvent>();
          const running = yield* workspace.watch({ install: "skip" }).pipe(
            Stream.runForEach((event) => Queue.offer(events, event)),
            Effect.forkScoped
          );
          expect(
            (yield* Queue.take(events).pipe(Effect.timeout("10 seconds")))._tag
          ).toBe("Synchronized");
          const item = yield* fs.readFileString(artifact);
          yield* fs.writeFileString(
            artifact,
            applyEdits(
              item,
              modify(
                item,
                ["files", 0, "content"],
                "export const banner = 'Updated campaign';\n",
                {}
              )
            )
          );
          expect(
            (yield* Queue.take(events).pipe(Effect.timeout("10 seconds")))._tag
          ).toBe("Synchronized");
          expect(
            yield* fs.readFileString(
              `${source}/workspaces/editorial-site/apps/web/banner.ts`
            )
          ).toBe("export const banner = 'Updated campaign';\n");
          const saved = yield* fs.readFile(artifact);
          yield* fs.remove(artifact);
          expect(
            (yield* Queue.take(events).pipe(Effect.timeout("10 seconds")))._tag
          ).toBe("RefreshFailed");
          yield* fs.writeFile(artifact, saved);
          expect(
            (yield* Queue.take(events).pipe(Effect.timeout("10 seconds")))._tag
          ).toBe("Synchronized");
          yield* Fiber.interrupt(running);
        }).pipe(
          Effect.provide(
            liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer))
          )
        ),
      { timeout: 30_000 }
    );
  }
);

it.live(
  "Watch follows Git configuration to an ignore file that does not exist yet",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { root, source } = yield* fixture("packages");
      const directory = `${source}/workspaces/editorial-site`;
      const original = `${root}/original-ignore`;
      const replacement = `${root}/settings/new-ignore`;
      const configure = (file: string) =>
        processes.exitCode(
          ChildProcess.make("git", ["config", "core.excludesFile", file], {
            cwd: source,
          })
        );
      yield* fs.copyFile(
        `${source}/packages/colors/index.ts`,
        `${source}/packages/colors/palette.ts`
      );
      yield* fs.writeFileString(original, "/packages/colors/palette.ts\n");
      const configured = yield* configure(original);
      const results = yield* Queue.unbounded<WatchEvent>();
      const workspace = yield* (yield* Workspaces).named({
        name: "editorial-site",
        sourceRoot: source,
      });
      const running = yield* workspace.watch({ install: "skip" }).pipe(
        Stream.runForEach((event) => Queue.offer(results, event)),
        Effect.forkScoped
      );
      const next = Queue.take(results).pipe(Effect.timeout("10 seconds"));
      const initial = yield* next;
      expect({
        configured,
        exists: yield* fs.exists(`${directory}/packages/colors/palette.ts`),
        outcome: initial._tag,
      }).toEqual({ configured: 0, exists: false, outcome: "Synchronized" });

      const changed = yield* configure(replacement);
      const switched = yield* next;
      expect({
        configured: changed,
        contents: yield* fs.readFileString(
          `${directory}/packages/colors/palette.ts`
        ),
        outcome: switched._tag,
      }).toEqual({
        configured: 0,
        contents: 'export const primary = "blue";\n',
        outcome: "Synchronized",
      });
      yield* fs.makeDirectory(`${root}/settings`);
      yield* fs.writeFileString(replacement, "/packages/colors/palette.ts\n");
      const excluded = yield* next;
      expect({
        exists: yield* fs.exists(`${directory}/packages/colors/palette.ts`),
        outcome: excluded._tag,
      }).toEqual({ exists: false, outcome: "Synchronized" });
      yield* fs.writeFileString(replacement, "");
      const restored = yield* next;
      expect({
        contents: yield* fs.readFileString(
          `${directory}/packages/colors/palette.ts`
        ),
        outcome: restored._tag,
      }).toEqual({
        contents: 'export const primary = "blue";\n',
        outcome: "Synchronized",
      });
      yield* Fiber.interrupt(running);
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    ),
  { timeout: 30_000 }
);

it.live(
  "Watch reconciles package output when an external Git ignore file changes",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { root, source } = yield* fixture("packages");
      const directory = `${source}/workspaces/editorial-site`;
      const ignores = `${root}/global-ignore`;
      yield* fs.copyFile(
        `${source}/packages/colors/index.ts`,
        `${source}/packages/colors/palette.ts`
      );
      yield* fs.writeFileString(ignores, "/packages/colors/palette.ts\n");
      expect(
        yield* processes.exitCode(
          ChildProcess.make("git", ["config", "core.excludesFile", ignores], {
            cwd: source,
          })
        )
      ).toBe(0);
      const results = yield* Queue.unbounded<WatchEvent>();
      const workspace = yield* (yield* Workspaces).named({
        name: "editorial-site",
        sourceRoot: source,
      });
      const running = yield* workspace.watch({ install: "skip" }).pipe(
        Stream.runForEach((event) => Queue.offer(results, event)),
        Effect.forkScoped
      );
      const next = Queue.take(results).pipe(Effect.timeout("10 seconds"));
      expect((yield* next)._tag).toBe("Synchronized");
      expect(
        yield* fs.exists(`${directory}/packages/colors/palette.ts`)
      ).toBeFalsy();

      yield* fs.writeFileString(ignores, "");
      const restored = yield* next;
      expect({
        contents: yield* fs.readFileString(
          `${directory}/packages/colors/palette.ts`
        ),
        outcome: restored._tag,
      }).toEqual({
        contents: 'export const primary = "blue";\n',
        outcome: "Synchronized",
      });
      yield* fs.writeFileString(ignores, "/packages/colors/palette.ts\n");
      const excluded = yield* next;
      expect({
        exists: yield* fs.exists(`${directory}/packages/colors/palette.ts`),
        outcome: excluded._tag,
      }).toEqual({ exists: false, outcome: "Synchronized" });
      yield* Fiber.interrupt(running);
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    ),
  { timeout: 30_000 }
);

it.live(
  "Watch removes and restores package files when repository exclusions change",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("packages");
      const directory = `${source}/workspaces/editorial-site`;
      yield* fs.copyFile(
        `${source}/packages/colors/index.ts`,
        `${source}/packages/colors/palette.ts`
      );
      const results = yield* Queue.unbounded<WatchEvent>();
      const workspace = yield* (yield* Workspaces).named({
        name: "editorial-site",
        sourceRoot: source,
      });
      const running = yield* workspace.watch({ install: "skip" }).pipe(
        Stream.runForEach((event) => Queue.offer(results, event)),
        Effect.forkScoped
      );
      const next = Queue.take(results).pipe(Effect.timeout("10 seconds"));
      yield* next;
      expect(
        yield* fs.readFileString(`${directory}/packages/colors/palette.ts`)
      ).toBe('export const primary = "blue";\n');

      yield* fs.writeFileString(
        `${source}/.git/info/exclude`,
        "/packages/colors/palette.ts\n"
      );
      expect((yield* next)._tag).toBe("Synchronized");
      expect(
        yield* fs.exists(`${directory}/packages/colors/palette.ts`)
      ).toBeFalsy();
      yield* fs.writeFileString(`${source}/.git/info/exclude`, "");
      expect((yield* next)._tag).toBe("Synchronized");
      expect(
        yield* fs.readFileString(`${directory}/packages/colors/palette.ts`)
      ).toBe('export const primary = "blue";\n');
      yield* Fiber.interrupt(running);
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    ),
  { timeout: 30_000 }
);

for (const worktree of [false, true]) {
  it.live(
    `Watch materializes an ignored package file when it becomes tracked (worktree: ${worktree})`,
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
        const { source } = yield* fixture("packages", worktree);
        const directory = `${source}/workspaces/editorial-site`;
        yield* fs.copyFile(
          `${source}/packages/colors/index.ts`,
          `${source}/packages/colors/scratch.ts`
        );
        const results = yield* Queue.unbounded<WatchEvent>();
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: source,
        });
        const running = yield* workspace.watch({ install: "skip" }).pipe(
          Stream.runForEach((event) => Queue.offer(results, event)),
          Effect.forkScoped
        );
        const next = Queue.take(results).pipe(Effect.timeout("10 seconds"));
        expect((yield* next)._tag).toBe("Synchronized");
        expect(
          yield* fs.exists(`${directory}/packages/colors/scratch.ts`)
        ).toBeFalsy();
        expect(
          yield* processes.exitCode(
            ChildProcess.make(
              "git",
              ["add", "-f", "packages/colors/scratch.ts"],
              {
                cwd: source,
              }
            )
          )
        ).toBe(0);
        expect((yield* next)._tag).toBe("Synchronized");
        expect(
          yield* fs.readFileString(`${directory}/packages/colors/scratch.ts`)
        ).toBe('export const primary = "blue";\n');
        yield* Fiber.interrupt(running);
      }).pipe(
        Effect.provide(
          liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer))
        )
      ),
    { timeout: 30_000 }
  );
}

it.live(
  "Watch leaves ignored package files alone and copies newly visible source",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("packages");
      const directory = `${source}/workspaces/editorial-site`;
      const results = yield* Queue.unbounded<WatchEvent>();
      const workspace = yield* (yield* Workspaces).named({
        name: "editorial-site",
        sourceRoot: source,
      });
      const running = yield* workspace.watch({ install: "skip" }).pipe(
        Stream.runForEach((event) => Queue.offer(results, event)),
        Effect.forkScoped
      );
      const next = Queue.take(results).pipe(Effect.timeout("10 seconds"));
      expect((yield* next)._tag).toBe("Synchronized");
      yield* fs.copyFile(
        `${source}/packages/colors/index.ts`,
        `${source}/packages/colors/scratch.ts`
      );
      expect(
        Option.isNone(
          yield* Queue.take(results).pipe(Effect.timeoutOption("2 seconds"))
        )
      ).toBeTruthy();
      expect(
        yield* fs.exists(`${directory}/packages/colors/scratch.ts`)
      ).toBeFalsy();

      yield* fs.rename(
        `${source}/packages/colors/scratch.ts`,
        `${source}/packages/colors/palette.ts`
      );
      expect((yield* next)._tag).toBe("Synchronized");
      expect(
        yield* fs.readFileString(`${directory}/packages/colors/palette.ts`)
      ).toBe('export const primary = "blue";\n');
      yield* Fiber.interrupt(running);
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    ),
  { timeout: 30_000 }
);

it.live(
  "Watch ignores unselected source edits and observes a recipe after selection changes",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("application");
      const directory = `${source}/workspaces/configured-site`;
      const results = yield* Queue.unbounded<WatchEvent>();
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: source,
      });
      const running = yield* workspace.watch({ install: "skip" }).pipe(
        Stream.runForEach((event) => Queue.offer(results, event)),
        Effect.forkScoped
      );
      const next = Queue.take(results).pipe(Effect.timeout("10 seconds"));
      expect((yield* next)._tag).toBe("Synchronized");
      const original = yield* fs.readFileString(`${source}/outer.tsx`);
      yield* fs.writeFileString(`${source}/outer.tsx`, `${original}\n`);
      expect(
        Option.isNone(
          yield* Queue.take(results).pipe(Effect.timeoutOption("2 seconds"))
        )
      ).toBeTruthy();
      expect(yield* fs.exists(`${directory}/apps/web/outer.tsx`)).toBeFalsy();

      const definition = yield* fs.readFileString(
        `${directory}/next-hydra.json`
      );
      yield* fs.writeFileString(
        `${directory}/next-hydra.json`,
        definition.replace('"addOns": []', '"addOns": ["a-outer"]')
      );
      yield* next;
      expect(yield* fs.readFileString(`${directory}/apps/web/outer.tsx`)).toBe(
        `${original}\n`
      );
      const edited = original.replace(
        "<aside>",
        '<aside aria-label="Selected recipe">'
      );
      yield* fs.writeFileString(`${source}/outer.tsx`, edited);
      yield* next;
      expect(yield* fs.readFileString(`${directory}/apps/web/outer.tsx`)).toBe(
        edited
      );
      yield* Fiber.interrupt(running);
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    ),
  { timeout: 30_000 }
);

it.live(
  "Watch discovers new whole-package files without observing unselected governed files",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("packages");
      const directory = `${source}/workspaces/editorial-site`;
      const results = yield* Queue.unbounded<WatchEvent>();
      const workspace = yield* (yield* Workspaces).named({
        name: "editorial-site",
        sourceRoot: source,
      });
      const running = yield* workspace.watch({ install: "skip" }).pipe(
        Stream.runForEach((event) => Queue.offer(results, event)),
        Effect.forkScoped
      );
      const next = Queue.take(results).pipe(Effect.timeout("10 seconds"));
      expect(yield* next).toMatchObject({ _tag: "Synchronized" });
      const optional = `${source}/packages/tokens/optional.ts`;
      yield* fs.writeFileString(
        optional,
        `${yield* fs.readFileString(optional)}\n`
      );
      expect(
        Option.isNone(
          yield* Queue.take(results).pipe(Effect.timeoutOption("2 seconds"))
        )
      ).toBeTruthy();
      expect(
        yield* fs.exists(`${directory}/packages/tokens/optional.ts`)
      ).toBeFalsy();

      yield* fs.copyFile(
        `${source}/packages/colors/index.ts`,
        `${source}/packages/colors/palette.ts`
      );
      expect(yield* next).toMatchObject({ _tag: "Synchronized" });
      expect(
        yield* fs.readFileString(`${directory}/packages/colors/palette.ts`)
      ).toBe('export const primary = "blue";\n');
      yield* Fiber.interrupt(running);
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    ),
  { timeout: 30_000 }
);

it.live(
  "Watch resumes when a missing newly selected source is restored",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("application");
      const directory = `${source}/workspaces/configured-site`;
      const results = yield* Queue.unbounded<WatchEvent>();
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: source,
      });
      const running = yield* workspace.watch({ install: "skip" }).pipe(
        Stream.runForEach((event) => Queue.offer(results, event)),
        Effect.forkScoped
      );
      const next = Queue.take(results).pipe(Effect.timeout("10 seconds"));
      expect(yield* next).toMatchObject({ _tag: "Synchronized" });
      const original = yield* fs.readFileString(`${source}/outer.tsx`);
      yield* fs.remove(`${source}/outer.tsx`);
      const definition = yield* fs.readFileString(
        `${directory}/next-hydra.json`
      );
      yield* fs.writeFileString(
        `${directory}/next-hydra.json`,
        definition.replace('"addOns": []', '"addOns": ["a-outer"]')
      );
      expect(yield* next).toMatchObject({ _tag: "RefreshFailed" });
      expect(yield* fs.exists(`${directory}/apps/web/outer.tsx`)).toBeFalsy();
      yield* fs.writeFileString(`${source}/outer.tsx`, original);
      expect(yield* next).toMatchObject({ _tag: "Synchronized" });
      expect(yield* fs.readFileString(`${directory}/apps/web/outer.tsx`)).toBe(
        original
      );
      yield* Fiber.interrupt(running);
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    ),
  { timeout: 30_000 }
);

it.live(
  "Watch reconnects replaced source directories and releases the workspace on shutdown",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source, root } = yield* fixture("application");
      const directory = `${source}/workspaces/configured-site`;
      const initial = yield* Deferred.make<undefined>();
      const refreshed = yield* Deferred.make<undefined>();
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: source,
      });
      const watching = yield* workspace.watch({ install: "skip" }).pipe(
        Stream.runForEach((event) =>
          Effect.gen(function* () {
            if (event._tag !== "Synchronized") {
              return;
            }
            yield* Deferred.succeed(initial, undefined);
            const manifest = yield* fs.readFileString(
              `${directory}/apps/web/package.json`
            );
            if (manifest.includes("replacement directory")) {
              yield* Deferred.succeed(refreshed, undefined);
            }
          })
        ),
        Effect.forkScoped
      );
      yield* Deferred.await(initial).pipe(Effect.timeout("15 seconds"));
      yield* fs.rename(`${source}/apps/web`, `${root}/previous-web`);
      yield* fs.copy(`${root}/previous-web`, `${source}/apps/web`);
      const manifest = yield* fs.readFileString(
        `${source}/apps/web/package.json`
      );
      yield* fs.writeFileString(
        `${source}/apps/web/package.json`,
        manifest.replace(
          '"private": true',
          '"private": true, "description": "replacement directory"'
        )
      );
      yield* Deferred.await(refreshed).pipe(Effect.timeout("15 seconds"));
      yield* Fiber.interrupt(watching);
      expect(
        yield* fs.exists(`${directory}/.workspace-composition.lock`)
      ).toBeFalsy();
      expect((yield* workspace.diff).patch).toBe("");
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    )
);
