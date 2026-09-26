import { expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";

import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";

for (const target of [".git", ".gitignore", "apps/web/vercel.json"]) {
  it.effect(`refuses a directory at ${target} before publishing source`, () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = "/source/workspaces/configured-site";
        if (yield* fs.exists(`${root}/${target}`)) {
          yield* fs.remove(`${root}/${target}`);
        }
        yield* fs.makeDirectory(`${root}/${target}`);
        yield* fs.writeFileString(`${root}/${target}/local`, "Keep my work");
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        expect(yield* workspace.check().pipe(Effect.flip)).toMatchObject({
          _tag: "DestinationNotEmpty",
        });
        expect(
          yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({ _tag: "DestinationNotEmpty" });
        expect(yield* fs.exists(`${root}/package.json`)).toBeFalsy();
        expect(yield* fs.readFileString(`${root}/${target}/local`)).toBe(
          "Keep my work"
        );
      }).pipe(Effect.provide(layer));
    })
  );
}

it.effect(
  "refuses output below a workspace settings file before publishing application files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const registry = yield* fs.readFileString("/source/registry.json");
        yield* fs.writeFileString(
          "/source/registry.json",
          registry.replace(
            '"~/apps/web/.env.example"',
            '"~/README.md/new-source.ts"'
          )
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        expect(
          yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "InvalidComposition",
        });
        expect(
          yield* fs.exists("/source/workspaces/configured-site/package.json")
        ).toBeFalsy();
        expect(
          (yield* fs.stat("/source/workspaces/configured-site/README.md")).type
        ).toBe("File");
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "detects a directory occupying an output file before publishing unrelated files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = "/source/workspaces/configured-site";
        yield* fs.makeDirectory(`${root}/apps/web/layout.tsx`);
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        expect(
          yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "WorkspaceConflict",
          paths: ["apps/web/layout.tsx"],
        });
        expect(yield* fs.exists(`${root}/package.json`)).toBeFalsy();
        expect((yield* fs.stat(`${root}/apps/web/layout.tsx`)).type).toBe(
          "Directory"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects registry output inside reserved caches before publication",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const registry = yield* fs.readFileString("/source/registry.json");
        yield* fs.writeFileString(
          "/source/registry.json",
          registry.replace(
            '"~/apps/web/.env.example"',
            '"~/apps/web/.next/new-source.ts"'
          )
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        expect(
          yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "InvalidComposition",
        });
        expect(
          yield* fs.exists("/source/workspaces/configured-site/package.json")
        ).toBeFalsy();
        expect(
          yield* fs.exists(
            "/source/workspaces/configured-site/apps/web/.next/new-source.ts"
          )
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "initializes beside ignored local files without adopting or replacing them",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = "/source/workspaces/configured-site";
        yield* fs.writeFileString(`${root}/.gitignore`, "*\n");
        yield* fs.writeFileString(
          `${root}/apps/web/draft.ts`,
          "Keep this draft\n"
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        expect(yield* fs.readFileString(`${root}/apps/web/draft.ts`)).toBe(
          "Keep this draft\n"
        );
        expect(yield* fs.exists(`${root}/package.json`)).toBeTruthy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "preserves restored root and app cache bytes during named initialization",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = "/source/workspaces/configured-site";
        const cached = new Uint8Array([0, 255, 128, 13, 10]);
        yield* fs.makeDirectory(`${root}/.turbo`, { recursive: true });
        yield* fs.writeFile(`${root}/.turbo/previous-build`, cached);
        yield* fs.makeDirectory(`${root}/apps/web/.next/cache`, {
          recursive: true,
        });
        yield* fs.writeFile(
          `${root}/apps/web/.next/cache/previous-build`,
          cached
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        expect(yield* fs.readFile(`${root}/.turbo/previous-build`)).toEqual(
          cached
        );
        expect(
          yield* fs.readFile(`${root}/apps/web/.next/cache/previous-build`)
        ).toEqual(cached);
        expect(yield* fs.exists(`${root}/apps/web/package.json`)).toBeTruthy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects deployment settings for an unselected application before publishing source",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = "/source/workspaces/configured-site";
        yield* fs.makeDirectory(`${root}/apps/unselected`);
        yield* fs.writeFile(
          `${root}/apps/unselected/vercel.json`,
          yield* fs.readFile(`${root}/apps/web/vercel.json`)
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        expect(
          yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "InvalidComposition",
          message:
            "Deployment settings target an unselected application: apps/unselected/vercel.json",
        });
        expect(yield* fs.exists(`${root}/apps/web/package.json`)).toBeFalsy();
        expect(yield* fs.exists(`${root}/package.json`)).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "keeps application deployment defaults in fresh projects but leaves named workspaces to own their settings",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const api = yield* Workspaces;
        const fresh = yield* api.fresh({
          destination: "/application",
          name: "garden-site",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* fresh.materialize({ install: "skip" });
        const named = yield* api.named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        yield* named.sync({ install: "skip" });
        expect(yield* fs.readFile("/application/apps/web/vercel.json")).toEqual(
          yield* fs.readFile("/source/apps/web/vercel.json")
        );
        expect(yield* fs.readFile("/application/apps/web/.gitignore")).toEqual(
          yield* fs.readFile("/source/apps/web/.gitignore")
        );
        expect(
          yield* fs.exists(
            "/source/workspaces/editorial-site/apps/web/vercel.json"
          )
        ).toBeFalsy();
        expect(
          yield* fs.exists(
            "/source/workspaces/editorial-site/apps/web/.gitignore"
          )
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "initializes beside authored workspace settings without rewriting them",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = "/source/workspaces/configured-site";
        const settings = [
          "next-hydra.json",
          ".gitignore",
          "README.md",
          "apps/web/.gitignore",
          "apps/web/vercel.json",
        ];
        const before = new Map<string, Uint8Array>();
        for (const target of settings) {
          before.set(target, yield* fs.readFile(`${root}/${target}`));
        }
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        const result = yield* workspace.sync({ install: "skip" });
        const after = new Map<string, Uint8Array>();
        for (const target of settings) {
          after.set(target, yield* fs.readFile(`${root}/${target}`));
        }
        expect(after).toEqual(before);
        expect(yield* fs.readFileString(`${root}/.gitignore`)).toBe("");
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Hello");
        expect(
          result.files.filter((target) => settings.includes(target))
        ).toEqual([]);
      }).pipe(Effect.provide(layer));
    })
);
