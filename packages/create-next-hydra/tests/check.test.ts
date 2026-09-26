import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, FileSystem } from "effect";

import { Workspaces } from "../src/workspaces.ts";
import {
  memoryWorkspace,
  memoryWorkspaceServices,
} from "./fixtures/memory-workspace.ts";

const root = "/source/workspaces/configured-site";
const named = Workspaces.pipe(
  Effect.flatMap((api) =>
    api.named({ name: "configured-site", sourceRoot: "/source" })
  )
);

it.effect(
  "reports missing workspace ignore settings without creating them",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* named;
        yield* workspace.sync({ install: "skip" });
        yield* fs.remove(`${root}/.gitignore`);
        expect((yield* workspace.check()).changes).toEqual([
          { kind: "setting", target: ".gitignore" },
        ]);
        expect(yield* fs.exists(`${root}/.gitignore`)).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "reports files-only synchronization as needing installation without writing state or running a package manager",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* (yield* named).sync({ install: "skip" });
        const before = yield* fs.readFile(
          `${root}/.workspace-composition.json`
        );
        const report = yield* named.pipe(
          Effect.flatMap((workspace) => workspace.check()),
          Effect.provide(memoryWorkspaceServices())
        );
        expect(report).toMatchObject({
          changes: [],
          dependencies: "pending",
          initialized: true,
          ready: false,
        });
        expect(report.dependencyReasons).toEqual([
          "No successful installation recorded",
        ]);
        expect(
          yield* fs.readFile(`${root}/.workspace-composition.json`)
        ).toEqual(before);
        expect(
          yield* fs.exists(`${root}/.workspace-composition.lock`)
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "reports a non-directory parent as the blocking path instead of proposing writes below it",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* named;
        yield* workspace.sync({ install: "skip" });
        yield* fs.remove(`${root}/apps/web`, { recursive: true });
        yield* fs.writeFileString(
          `${root}/apps/web`,
          "Local file replacing app directory\n"
        );
        expect((yield* workspace.check()).changes).toEqual([
          { kind: "conflict", target: "apps/web" },
        ]);
        expect(yield* fs.readFileString(`${root}/apps/web`)).toBe(
          "Local file replacing app directory\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "does not infer ownership from matching files when the receipt is missing or corrupt",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* named;
        expect(yield* workspace.check()).toMatchObject({
          initialized: false,
          ready: false,
        });
        yield* workspace.sync({ install: "skip" });
        yield* fs.remove(`${root}/.workspace-composition.json`);
        const missing = yield* workspace.check();
        expect(missing).toMatchObject({ initialized: false, ready: false });
        expect(missing.changes).toContainEqual({
          kind: "unregistered",
          target: "apps/web/layout.tsx",
        });
        expect(
          yield* fs.exists(`${root}/.workspace-composition.json`)
        ).toBeFalsy();
        yield* fs.writeFileString(
          `${root}/.workspace-composition.json`,
          "{broken receipt"
        );
        expect(yield* workspace.check().pipe(Effect.flip)).toMatchObject({
          _tag: "WorkspaceStateInvalid",
        });
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "refuses a stable Check result when another synchronization finishes during preparation",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<undefined>();
      const release = yield* Deferred.make<undefined>();
      let pause = false;
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          readFile: (file) =>
            Effect.gen(function* () {
              if (pause && file === "/source/layout.tsx.template") {
                pause = false;
                yield* Deferred.succeed(entered, undefined);
                yield* Deferred.await(release);
              }
              return yield* fs.readFile(file);
            }),
        }),
      });
      yield* Effect.gen(function* () {
        const workspace = yield* named;
        yield* workspace.sync({ install: "skip" });
        pause = true;
        const checking = yield* workspace.check().pipe(Effect.forkChild);
        yield* Deferred.await(entered);
        yield* workspace.sync({ install: "skip" });
        yield* Deferred.succeed(release, undefined);
        expect(yield* Fiber.join(checking).pipe(Effect.flip)).toMatchObject({
          _tag: "WorkspaceStateInvalid",
        });
      }).pipe(Effect.provide(layer));
    })
);

it.effect("does not inspect an actively synchronizing workspace", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<undefined>();
    const release = yield* Deferred.make<undefined>();
    let pause = true;
    const layer = yield* memoryWorkspace("application", {
      fileSystem: (fs) => ({
        ...fs,
        readFile: (file) =>
          Effect.gen(function* () {
            if (pause && file === "/source/layout.tsx.template") {
              pause = false;
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
            }
            return yield* fs.readFile(file);
          }),
      }),
    });
    yield* Effect.gen(function* () {
      const workspace = yield* named;
      const syncing = yield* workspace
        .sync({ install: "skip" })
        .pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      expect(yield* workspace.check().pipe(Effect.flip)).toMatchObject({
        _tag: "WorkspaceBusy",
      });
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(syncing);
    }).pipe(Effect.provide(layer));
  })
);

it.effect(
  "reports a directory replacing an owned file as a blocker and preserves its contents",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* named;
        yield* workspace.sync({ install: "skip" });
        const target = `${root}/apps/web/layout.tsx`;
        yield* fs.remove(target);
        yield* fs.makeDirectory(target);
        yield* fs.writeFileString(
          `${target}/draft.ts`,
          "Keep this nested draft\n"
        );
        const report = yield* workspace.check();
        expect(report.ready).toBeFalsy();
        expect(report.changes).toEqual([
          { kind: "conflict", target: "apps/web/layout.tsx" },
        ]);
        expect(yield* fs.readFileString(`${target}/draft.ts`)).toBe(
          "Keep this nested draft\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "reports canonical updates without treating unrelated drafts as changes to apply",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* named;
        yield* workspace.sync({ install: "skip" });
        const before = yield* fs.readFile(`${root}/apps/web/layout.tsx`);
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Welcome")
        );
        yield* fs.writeFileString(`${root}/.gitignore`, "*\n");
        yield* fs.writeFileString(
          `${root}/apps/web/draft.ts`,
          "Keep my draft\n"
        );
        const report = yield* workspace.check();
        expect(report.changes).toEqual([
          { kind: "update", target: "apps/web/layout.tsx" },
        ]);
        expect(report.ready).toBeFalsy();
        expect(yield* fs.readFile(`${root}/apps/web/layout.tsx`)).toEqual(
          before
        );
        expect(yield* fs.readFileString(`${root}/apps/web/draft.ts`)).toBe(
          "Keep my draft\n"
        );
      }).pipe(Effect.provide(layer));
    })
);
