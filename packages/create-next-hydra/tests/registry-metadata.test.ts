import { expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { applyEdits, modify } from "jsonc-parser";
import { parse } from "yaml";

import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";

it.effect(
  "rejects ambiguous item identities instead of choosing one source by order",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const registry = yield* fs.readFileString("/source/registry.json");
        yield* fs.writeFileString(
          "/source/registry.json",
          applyEdits(
            registry,
            modify(registry, ["items", 2, "name"], "editorial", {})
          )
        );
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "site",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        expect(
          yield* workspace.materialize({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(yield* fs.exists("/application")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

for (const kind of ["provider", "preset"]) {
  it.effect(
    `refuses incomplete ${kind} metadata even when it is not selected`,
    () =>
      Effect.gen(function* () {
        const layer = yield* memoryWorkspace("application");
        yield* Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const registry = yield* fs.readFileString("/source/registry.json");
          yield* fs.writeFileString(
            "/source/registry.json",
            applyEdits(
              registry,
              modify(
                registry,
                ["items", 0, "meta", "nextHydra", "kind"],
                kind,
                {}
              )
            )
          );
          const workspace = yield* (yield* Workspaces).fresh({
            destination: "/application",
            name: "invalid-site",
            selection: { addOns: [], providers: {} },
            source: { kind: "working-tree", root: "/source" },
          });
          expect(
            yield* workspace.materialize({ install: "skip" }).pipe(Effect.flip)
          ).toMatchObject({ _tag: "InvalidComposition" });
          expect(yield* fs.exists("/application")).toBeFalsy();
        }).pipe(Effect.provide(layer));
      })
  );
}

it.effect(
  "rejects provider binding metadata on an add-on before publishing any files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const registry = yield* fs.readFileString("/source/registry.json");
        yield* fs.writeFileString(
          "/source/registry.json",
          applyEdits(
            registry,
            modify(
              registry,
              ["items", 0, "meta", "nextHydra", "slot"],
              "cms",
              {}
            )
          )
        );
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "invalid-site",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        expect(
          yield* workspace.materialize({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(yield* fs.exists("/application")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "materializes a compatible graph but refuses an add-on conflicting with a reached recipe",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const api = yield* Workspaces;
        const compatible = yield* api.fresh({
          destination: "/compatible",
          name: "compatible-site",
          selection: {
            addOns: ["with-tracking", "instrumentation"],
            providers: {},
          },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* compatible.materialize({ install: "skip" });
        expect(
          yield* fs.readFileString("/compatible/apps/web/tracking.ts")
        ).toBe('export const tracking = "enabled";\n');
        const conflicting = yield* api.fresh({
          destination: "/conflicting",
          name: "conflicting-site",
          selection: {
            addOns: ["with-tracking", "instrumentation", "privacy"],
            providers: {},
          },
          source: { kind: "working-tree", root: "/source" },
        });
        expect(
          yield* conflicting.materialize({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "IncompatibleSelection",
          conflicts: ["example/recipes/tracking"],
          missing: [],
          selection: "example/add-ons/privacy",
        });
        expect(yield* fs.exists("/conflicting")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "checks a transitive recipe's compatibility before reading its source files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove("/source/tracking.ts");
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "invalid-site",
          selection: { addOns: ["with-tracking"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        expect(
          yield* workspace.materialize({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "IncompatibleSelection",
          conflicts: [],
          missing: ["example/add-ons/instrumentation"],
          selection: "example/recipes/tracking",
        });
        expect(yield* fs.exists("/application")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects competing patches instead of making selection order choose the patch",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "invalid-site",
          selection: {
            addOns: ["alternative-patch", "patched-client"],
            providers: {},
          },
          source: { kind: "working-tree", root: "/source" },
        });
        expect(
          yield* workspace.materialize({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(yield* fs.exists("/application")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "refuses a patch declaration whose file is not a selected asset",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "invalid-site",
          selection: { addOns: ["unowned-patch"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        expect(
          yield* workspace.materialize({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "InvalidComposition",
          message:
            "example-client@1.0.0 references patches/missing.patch, which is not a selected asset",
        });
        expect(yield* fs.exists("/application")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "carries selected patch bytes, install declarations and lock resolution seeds together",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "patched-site",
          selection: { addOns: ["patched-client"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        const settings: unknown = parse(
          yield* fs.readFileString("/application/pnpm-workspace.yaml")
        );
        const lock: unknown = parse(
          yield* fs.readFileString("/application/pnpm-lock.yaml")
        );
        expect(settings).toHaveProperty("patchedDependencies", {
          "example-client@1.0.0": "patches/client.patch",
        });
        expect(lock).toHaveProperty("patchedDependencies", {
          "example-client@1.0.0": {
            hash: "retained-resolution",
            path: "patches/client.patch",
          },
        });
        expect(yield* fs.readFile("/application/patches/client.patch")).toEqual(
          yield* fs.readFile("/source/client.patch")
        );
        expect(
          yield* fs.exists("/application/patches/unselected.patch")
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "preserves registry assets byte-for-byte instead of rewriting their hostname references",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const original = yield* fs.readFile("/source/brand.svg");
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "branded-site",
          selection: { addOns: ["branding"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs.readFile("/application/apps/web/public/brand.svg")
        ).toEqual(original);
        expect(
          yield* fs.readFileString("/application/apps/web/.env.example")
        ).toBe(
          "NEXT_PUBLIC_SITE_URL=http://web.branded-site.localhost:1355\nNEXT_PUBLIC_OTHER_URL=http://other-web.localhost:1355\n"
        );
      }).pipe(Effect.provide(layer));
    })
);
