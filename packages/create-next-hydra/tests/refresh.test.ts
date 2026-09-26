import { expect, it } from "@effect/vitest";
import {
  Array as EffectArray,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Order,
  PlatformError,
  Schema,
} from "effect";

import { Workspaces } from "../src/workspaces.ts";
import {
  memoryWorkspace,
  memoryWorkspaceServices,
} from "./fixtures/memory-workspace.ts";

const root = "/source/workspaces/configured-site";
const sync = Effect.gen(function* () {
  const workspace = yield* (yield* Workspaces).named({
    name: "configured-site",
    sourceRoot: "/source",
  });
  return yield* workspace.sync({ install: "skip" });
});

it.effect(
  "initializes, checks and refreshes beside unreadable unrelated output",
  () =>
    Effect.gen(function* () {
      const local = ["local-output", "apps/web/local-output"];
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          readDirectory: (target) =>
            local.some((directory) => target === `${root}/${directory}`)
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    method: "readDirectory",
                    module: "FileSystem",
                    pathOrDescriptor: target,
                  })
                )
              : fs.readDirectory(target),
        }),
        // These outputs are ignored by Git, independently of destination checks.
        ignored: local.map((target) => `workspaces/configured-site/${target}`),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        for (const target of local) {
          yield* fs.makeDirectory(`${root}/${target}`, { recursive: true });
          yield* fs.writeFileString(`${root}/${target}/result`, "Local output");
        }
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Welcome")
        );
        expect((yield* workspace.check()).changes).toEqual([
          { kind: "update", target: "apps/web/layout.tsx" },
        ]);
        yield* workspace.sync({ install: "skip" });
        expect((yield* workspace.check()).changes).toEqual([]);
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Welcome");
        for (const target of local) {
          expect(yield* fs.readFileString(`${root}/${target}/result`)).toBe(
            "Local output"
          );
        }
      }).pipe(Effect.provide(layer));
    })
);

it.effect("refreshes source without removing compiled package output", () =>
  Effect.gen(function* () {
    const layer = yield* memoryWorkspace("application");
    yield* Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* sync;
      yield* fs.makeDirectory(`${root}/apps/web/dist`, { recursive: true });
      yield* fs.writeFileString(
        `${root}/apps/web/dist/page.js`,
        "export const compiled = true;\n"
      );
      const source = yield* fs.readFileString("/source/layout.tsx.template");
      yield* fs.writeFileString(
        "/source/layout.tsx.template",
        `${source}\n// Updated canonical layout\n`
      );
      yield* sync;
      expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toContain(
        "// Updated canonical layout"
      );
      expect(yield* fs.readFileString(`${root}/apps/web/dist/page.js`)).toBe(
        "export const compiled = true;\n"
      );
    }).pipe(Effect.provide(layer));
  })
);

it.effect(
  "publishes no application files when durable intent cannot be recorded",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          rename: (source, destination) =>
            destination === `${root}/.workspace-composition.json`
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    method: "rename",
                    module: "FileSystem",
                    pathOrDescriptor: destination,
                  })
                )
              : fs.rename(source, destination),
        }),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* sync.pipe(Effect.exit);
        expect(yield* fs.exists(`${root}/apps/web/layout.tsx`)).toBeFalsy();
        expect(yield* fs.exists(`${root}/package.json`)).toBeFalsy();
        expect(
          yield* sync.pipe(
            Effect.provide(memoryWorkspaceServices()),
            Effect.flip
          )
        ).toMatchObject({ _tag: "WorkspaceLockAuthorizationRequired" });
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "joins an interrupted write before another synchronization can recover it",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<undefined>();
      const release = yield* Deferred.make<undefined>();
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          writeFile: (file, content, options) =>
            file === `${root}/apps/web/layout.tsx`
              ? Deferred.succeed(entered, undefined).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.andThen(fs.writeFile(file, content, options))
                )
              : fs.writeFile(file, content, options),
        }),
      });
      yield* Effect.gen(function* () {
        const first = yield* sync.pipe(Effect.forkChild);
        yield* Deferred.await(entered);
        const stopping = yield* Fiber.interrupt(first).pipe(
          Effect.forkChild({ startImmediately: true })
        );
        const blocked = yield* sync.pipe(Effect.flip);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(stopping);
        expect(blocked).toMatchObject({
          _tag: "WorkspaceLockAuthorizationRequired",
        });
        yield* sync.pipe(Effect.provide(memoryWorkspaceServices()));
        expect(
          yield* (yield* FileSystem.FileSystem).readFileString(
            `${root}/apps/web/layout.tsx`
          )
        ).toBe("export function Layout() {\n  return <main>Hello</main>;\n}\n");
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "refreshes canonical changes after reconstructing services from persisted workspace state",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* sync;
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Welcome")
        );
        yield* sync.pipe(Effect.provide(memoryWorkspaceServices()));
        expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toBe(
          "export function Layout() {\n  return <main>Welcome</main>;\n}\n"
        );
        expect(yield* fs.readFileString(`${root}/.gitignore`)).toBe("");
        expect(yield* fs.exists(`${root}/.env.local`)).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "removes only previously owned unchanged files when a recipe is deselected",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const selection = yield* fs.readFile(`${root}/next-hydra.json`);
        yield* fs.writeFile(
          `${root}/next-hydra.json`,
          yield* fs.readFile("/source/workspaces/enhanced-site/next-hydra.json")
        );
        yield* sync;
        expect(
          yield* fs.exists(`${root}/apps/web/public/brand.svg`)
        ).toBeTruthy();
        yield* fs.writeFileString(
          `${root}/apps/web/public/local-logo.svg`,
          "Keep this local asset"
        );
        yield* fs.writeFileString(
          `${root}/apps/web/controls.tsx`,
          "Local account changes"
        );
        yield* fs.writeFile(`${root}/next-hydra.json`, selection);
        expect(yield* sync.pipe(Effect.flip)).toMatchObject({
          _tag: "WorkspaceConflict",
          paths: ["apps/web/controls.tsx"],
        });
        expect(
          yield* fs.exists(`${root}/apps/web/public/brand.svg`)
        ).toBeTruthy();
        // Deleting an already deselected file is safe: there is nothing to remove.
        yield* fs.remove(`${root}/apps/web/controls.tsx`);
        yield* sync;
        expect({
          localAsset: yield* fs.readFileString(
            `${root}/apps/web/public/local-logo.svg`
          ),
          selectedAsset: yield* fs.exists(`${root}/apps/web/public/brand.svg`),
        }).toEqual({
          localAsset: "Keep this local asset",
          selectedAsset: false,
        });
        expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toBe(
          "export function Layout() {\n  return <main>Hello</main>;\n}\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

for (const kind of ["file", "directory", "parent"] as const) {
  it.effect(
    `rejects a newly selected recipe colliding with a local ${kind} before changing other files`,
    () =>
      Effect.gen(function* () {
        const layer = yield* memoryWorkspace("application");
        yield* Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* sync;
          const before = yield* fs.readFile(`${root}/apps/web/layout.tsx`);
          const target =
            kind === "parent" ? "apps/web/public" : "apps/web/controls.tsx";
          const local = kind === "directory" ? `${target}/draft.ts` : target;
          if (kind === "directory") {
            yield* fs.makeDirectory(`${root}/${target}`);
          }
          yield* fs.writeFileString(`${root}/${local}`, "Keep my local work");
          yield* fs.writeFile(
            `${root}/next-hydra.json`,
            yield* fs.readFile(
              "/source/workspaces/enhanced-site/next-hydra.json"
            )
          );
          const workspace = yield* (yield* Workspaces).named({
            name: "configured-site",
            sourceRoot: "/source",
          });
          const check = yield* workspace.check();
          expect(check.ready).toBeFalsy();
          expect(check.changes).toContainEqual({
            kind: kind === "file" ? "unregistered" : "conflict",
            target,
          });
          const failure = yield* sync.pipe(Effect.flip);
          if (failure._tag !== "WorkspaceConflict") {
            return yield* Effect.die(failure);
          }
          expect(failure.paths).toContain(target);
          expect(yield* fs.readFileString(`${root}/${local}`)).toBe(
            "Keep my local work"
          );
          expect(yield* fs.readFile(`${root}/apps/web/layout.tsx`)).toEqual(
            before
          );
        }).pipe(Effect.provide(layer));
      })
  );
}

it.effect("does not infer ownership when a receipt is corrupt or missing", () =>
  Effect.gen(function* () {
    const layer = yield* memoryWorkspace("application");
    yield* Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* sync;
      const before = yield* fs.readFile(`${root}/apps/web/layout.tsx`);
      yield* fs.writeFileString(
        `${root}/.workspace-composition.json`,
        "{broken"
      );
      expect(
        yield* sync.pipe(Effect.provide(memoryWorkspaceServices()), Effect.flip)
      ).toMatchObject({ _tag: "WorkspaceStateInvalid" });
      expect(yield* fs.readFile(`${root}/apps/web/layout.tsx`)).toEqual(before);
      yield* fs.remove(`${root}/.workspace-composition.json`);
      expect(yield* sync.pipe(Effect.flip)).toMatchObject({
        _tag: "WorkspaceConflict",
      });
      expect(yield* fs.readFile(`${root}/apps/web/layout.tsx`)).toEqual(before);
    }).pipe(Effect.provide(layer));
  })
);

it.effect(
  "refreshes source without adopting or removing ignored local files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* sync;
        yield* fs.writeFileString(`${root}/.gitignore`, "*\n");
        yield* fs.writeFileString(
          `${root}/apps/web/draft.ts`,
          "unregistered draft"
        );
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Welcome")
        );
        yield* sync;
        expect(yield* fs.readFileString(`${root}/apps/web/draft.ts`)).toBe(
          "unregistered draft"
        );
        expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toBe(
          "export function Layout() {\n  return <main>Welcome</main>;\n}\n"
        );
        yield* fs.writeFileString(`${root}/apps/web/draft.ts`, "revised draft");
        yield* sync;
        expect(yield* fs.readFileString(`${root}/apps/web/draft.ts`)).toBe(
          "revised draft"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "recovers a stopped replacement from recorded files and prepares current source again",
  () =>
    Effect.gen(function* () {
      let rejectReplacement = false;
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          rename: (source, destination) =>
            rejectReplacement && destination === `${root}/apps/web/layout.tsx`
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    method: "rename",
                    module: "FileSystem",
                    pathOrDescriptor: destination,
                  })
                )
              : fs.rename(source, destination),
        }),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* sync;
        const before = yield* fs.readFile(`${root}/apps/web/layout.tsx`);
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Welcome")
        );
        rejectReplacement = true;
        expect(yield* sync.pipe(Effect.flip)).toMatchObject({
          _tag: "MaterializationFailed",
          failedFile: "apps/web/layout.tsx",
        });
        expect(yield* fs.readFile(`${root}/apps/web/layout.tsx`)).toEqual(
          before
        );
        rejectReplacement = false;
        const receipt = yield* fs.readFile(
          `${root}/.workspace-composition.json`
        );
        expect(
          yield* Workspaces.pipe(
            Effect.flatMap((api) =>
              api.named({ name: "configured-site", sourceRoot: "/source" })
            ),
            Effect.flatMap((workspace) => workspace.check()),
            Effect.provide(memoryWorkspaceServices()),
            Effect.flip
          )
        ).toMatchObject({ _tag: "WorkspaceRecoveryRequired" });
        expect({
          layout: yield* fs.readFile(`${root}/apps/web/layout.tsx`),
          receipt: yield* fs.readFile(`${root}/.workspace-composition.json`),
        }).toEqual({ layout: before, receipt });
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Recovered from current source")
        );
        yield* sync.pipe(Effect.provide(memoryWorkspaceServices()));
        expect({
          layout: yield* fs.readFileString(`${root}/apps/web/layout.tsx`),
          pending: (yield* fs.readDirectory(`${root}/apps/web`)).filter(
            (name) => name.endsWith(".pending")
          ),
        }).toEqual({
          layout:
            "export function Layout() {\n  return <main>Recovered from current source</main>;\n}\n",
          pending: [],
        });
      }).pipe(Effect.provide(layer));
    })
);

it.effect("rejects an incomplete journal before cleaning retained files", () =>
  Effect.gen(function* () {
    let rejectReplacement = false;
    const layer = yield* memoryWorkspace("application", {
      fileSystem: (fs) => ({
        ...fs,
        rename: (source, destination) =>
          rejectReplacement && destination === `${root}/apps/web/layout.tsx`
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  method: "rename",
                  module: "FileSystem",
                  pathOrDescriptor: destination,
                })
              )
            : fs.rename(source, destination),
      }),
    });
    yield* Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* sync;
      const template = yield* fs.readFileString("/source/layout.tsx.template");
      yield* fs.writeFileString(
        "/source/layout.tsx.template",
        template.replace("Hello", "Welcome")
      );
      rejectReplacement = true;
      expect(yield* sync.pipe(Effect.flip)).toMatchObject({
        _tag: "MaterializationFailed",
      });
      rejectReplacement = false;
      const record = Schema.Record(Schema.String, Schema.Unknown);
      const json = Schema.fromJsonString(record);
      const receiptPath = `${root}/.workspace-composition.json`;
      const receipt = yield* Schema.decodeEffect(json)(
        yield* fs.readFileString(receiptPath)
      );
      const pending = yield* Schema.decodeUnknownEffect(record)(
        receipt.pending
      );
      const files = yield* Schema.decodeUnknownEffect(Schema.Array(record))(
        pending.files
      );
      const damaged = yield* Schema.encodeEffect(json)({
        ...receipt,
        pending: {
          ...pending,
          files: files.filter(
            (file) => file.target !== "apps/web/configuration.ts"
          ),
        },
      });
      yield* fs.writeFileString(receiptPath, damaged);
      const before = yield* fs.readDirectory(`${root}/apps/web`);
      expect(
        yield* sync.pipe(Effect.provide(memoryWorkspaceServices()), Effect.flip)
      ).toMatchObject({ _tag: "WorkspaceStateInvalid" });
      expect(yield* fs.readDirectory(`${root}/apps/web`)).toEqual(before);
      expect(yield* fs.readFileString(receiptPath)).toBe(damaged);
    }).pipe(Effect.provide(layer));
  })
);

for (const change of ["edit", "deletion", "mode", "temporary"] as const) {
  it.effect(`preserves an ambiguous ${change} and all recovery evidence`, () =>
    Effect.gen(function* () {
      let rejectReplacement = false;
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          rename: (source, destination) =>
            rejectReplacement && destination === `${root}/apps/web/layout.tsx`
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    method: "rename",
                    module: "FileSystem",
                    pathOrDescriptor: destination,
                  })
                )
              : fs.rename(source, destination),
        }),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* sync;
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          (yield* fs.readFileString("/source/layout.tsx.template")).replace(
            "Hello",
            "Welcome"
          )
        );
        rejectReplacement = true;
        expect(yield* sync.pipe(Effect.flip)).toMatchObject({
          _tag: "MaterializationFailed",
        });
        rejectReplacement = false;
        const names = yield* fs.readDirectory(`${root}/apps/web`);
        const temporary = names.find((name) => name.endsWith(".pending"));
        if (!temporary) {
          return yield* Effect.die(
            new Error("The failed replacement did not retain its file")
          );
        }
        // Configuration was unchanged by the interrupted update, but is still owned.
        const target = change === "temporary" ? temporary : "configuration.ts";
        const absolute = `${root}/apps/web/${target}`;
        if (change === "deletion") {
          yield* fs.remove(absolute);
        } else if (change === "mode") {
          yield* fs.chmod(absolute, 0o755);
        } else {
          yield* fs.writeFileString(absolute, "Local work after interruption");
        }
        const receipt = yield* fs.readFile(
          `${root}/.workspace-composition.json`
        );
        const retained = yield* fs.readFile(`${root}/apps/web/${temporary}`);
        expect(
          yield* sync.pipe(
            Effect.provide(memoryWorkspaceServices()),
            Effect.flip
          )
        ).toMatchObject({
          _tag: "WorkspaceConflict",
          paths: [`apps/web/${target}`],
        });
        expect({
          receipt: yield* fs.readFile(`${root}/.workspace-composition.json`),
          temporary: yield* fs.readFile(`${root}/apps/web/${temporary}`),
        }).toEqual({ receipt, temporary: retained });
        const contents =
          change === "deletion" ? null : yield* fs.readFileString(absolute);
        expect({
          exists: yield* fs.exists(absolute),
          mode: change === "deletion" ? null : (yield* fs.stat(absolute)).mode,
          text: change === "mode" ? null : contents,
        }).toEqual({
          exists: change !== "deletion",
          mode: { deletion: null, edit: 0o644, mode: 0o755, temporary: 0o644 }[
            change
          ],
          text:
            change === "mode" || change === "deletion"
              ? null
              : "Local work after interruption",
        });
      }).pipe(Effect.provide(layer));
    })
  );
}

it.effect(
  "replans a partially applied recipe selection without keeping abandoned files",
  () =>
    Effect.gen(function* () {
      let rejectReplacement = false;
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          rename: (source, destination) =>
            rejectReplacement && destination === `${root}/apps/web/layout.tsx`
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    method: "rename",
                    module: "FileSystem",
                    pathOrDescriptor: destination,
                  })
                )
              : fs.rename(source, destination),
        }),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* sync;
        const selection = yield* fs.readFile(`${root}/next-hydra.json`);
        yield* fs.writeFile(
          `${root}/next-hydra.json`,
          yield* fs.readFile("/source/workspaces/enhanced-site/next-hydra.json")
        );
        rejectReplacement = true;
        expect(yield* sync.pipe(Effect.flip)).toMatchObject({
          _tag: "MaterializationFailed",
        });
        rejectReplacement = false;
        yield* fs.writeFile(`${root}/next-hydra.json`, selection);
        yield* sync.pipe(Effect.provide(memoryWorkspaceServices()));
        expect(yield* fs.exists(`${root}/apps/web/controls.tsx`)).toBeFalsy();
        expect(
          yield* fs.exists(`${root}/apps/web/public/brand.svg`)
        ).toBeFalsy();
        expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toBe(
          "export function Layout() {\n  return <main>Hello</main>;\n}\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "does not admit another sync while a destination write is still running",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<undefined>();
      const release = yield* Deferred.make<undefined>();
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          writeFile: (file, content, options) =>
            file === `${root}/apps/web/layout.tsx`
              ? Deferred.succeed(entered, undefined).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.andThen(fs.writeFile(file, content, options))
                )
              : fs.writeFile(file, content, options),
        }),
      });
      yield* Effect.gen(function* () {
        const first = yield* sync.pipe(Effect.forkChild);
        yield* Deferred.await(entered);
        const blocked = yield* sync.pipe(
          Effect.provide(memoryWorkspaceServices()),
          Effect.flip
        );
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(first);
        expect(blocked).toMatchObject({
          _tag: "WorkspaceLockAuthorizationRequired",
        });
        yield* sync.pipe(Effect.provide(memoryWorkspaceServices()));
        expect(
          yield* (yield* FileSystem.FileSystem).exists(
            `${root}/.workspace-composition.lock`
          )
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "protects local edits, deletions, and executable bits before updating any other file",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* sync;
        const manifest = yield* fs.readFile(`${root}/package.json`);
        yield* fs.writeFileString(`${root}/apps/web/layout.tsx`, "local draft");
        yield* fs.remove(`${root}/apps/web/query.ts`);
        yield* fs.chmod(`${root}/apps/web/configuration.ts`, 0o755);
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Welcome")
        );
        const error = yield* sync.pipe(
          Effect.provide(memoryWorkspaceServices()),
          Effect.flip
        );
        if (error._tag !== "WorkspaceConflict") {
          return yield* Effect.die(error);
        }
        expect(EffectArray.sort(error.paths, Order.String)).toEqual([
          "apps/web/configuration.ts",
          "apps/web/layout.tsx",
          "apps/web/query.ts",
        ]);
        expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toBe(
          "local draft"
        );
        expect(yield* fs.exists(`${root}/apps/web/query.ts`)).toBeFalsy();
        expect((yield* fs.stat(`${root}/apps/web/configuration.ts`)).mode).toBe(
          0o755
        );
        expect(yield* fs.readFile(`${root}/package.json`)).toEqual(manifest);
      }).pipe(Effect.provide(layer));
    })
);
