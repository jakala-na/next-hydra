import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Schema } from "effect";
import { applyEdits, modify, parse } from "jsonc-parser";
import { parse as parseYaml } from "yaml";

import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";

const json = Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown));

it.effect(
  "resolves nested packages from workspace declarations without including excluded or maintainer packages",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("package-layout");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "palette",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs.readFileString(
            "/application/modules/design/colors/index.ts"
          )
        ).toBe('export const color = "blue";\n');
        const configuration: unknown = parseYaml(
          yield* fs.readFileString("/application/pnpm-workspace.yaml")
        );
        expect(configuration).toHaveProperty("packages", [
          "apps/*",
          "packages/*",
          "modules/**",
          "!modules/excluded",
        ]);
        expect(yield* fs.exists("/application/workspaces")).toBeFalsy();
        expect(yield* fs.exists("/application/modules/excluded")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "copies environment-related source and examples without copying runtime environment files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("packages");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "palette",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs.readFileString(
            "/application/packages/colors/.environment.ts"
          )
        ).toBe('export const environment = "browser";\n');
        expect(
          yield* fs.readFileString("/application/packages/colors/.env.sample")
        ).toBe("COLOR=blue\n");
        expect(
          yield* fs.exists("/application/packages/colors/.env.local")
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects recipes that bind the same consumer alias to different source packages",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("bindings");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "metrics-site",
          selection: {
            addOns: ["metrics", "conflicting-metrics"],
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
  "binds a selected recipe's explicit alias to copied package source",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("bindings");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "metrics-site",
          selection: { addOns: ["metrics"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        const config: unknown = parse(
          yield* fs.readFileString("/application/apps/web/tsconfig.json")
        );
        expect(config).toHaveProperty(
          ["compilerOptions", "paths", "@metrics"],
          ["../../packages/metrics"]
        );
        expect(config).toHaveProperty(
          ["compilerOptions", "paths", "@metrics/*"],
          ["../../packages/metrics/*"]
        );
        expect(
          yield* fs.exists("/application/packages/metrics/package.json")
        ).toBeTruthy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects a generic package requirement that bypasses provider selection",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("bindings");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const registry = yield* fs.readFileString("/source/registry.json");
        yield* fs.writeFileString(
          "/source/registry.json",
          applyEdits(
            registry,
            modify(
              registry,
              ["items", 2, "meta", "nextHydra", "packages", 0, "name"],
              "@repo/cms",
              {}
            )
          )
        );
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "invalid-site",
          selection: { addOns: ["metrics"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        const error = yield* workspace
          .materialize({ install: "skip" })
          .pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "InvalidComposition",
          message: "@repo/cms must be declared through providerDependencies",
        });
        expect(yield* fs.exists("/application")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "removes unselected provider TypeScript paths while preserving application paths",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("bindings");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "plain-site",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        const config: unknown = parse(
          yield* fs.readFileString("/application/apps/web/tsconfig.json")
        );
        expect(config).toEqual({
          compilerOptions: { paths: { "@/*": ["./*"] }, strict: true },
        });
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "points TypeScript aliases at the selected materialized provider and preserves unrelated compiler settings",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("bindings");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const original = yield* fs.readFileString(
          "/source/apps/web/tsconfig.json"
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        const output = yield* fs.readFileString(
          "/source/workspaces/editorial-site/apps/web/tsconfig.json"
        );
        const config: unknown = parse(output);
        expect(config).toEqual({
          compilerOptions: {
            paths: {
              "@/*": ["./*"],
              "@repo/cms": ["../../packages/editorial"],
              "@repo/cms/*": ["../../packages/editorial/*"],
            },
            strict: true,
          },
        });
        expect(output).toContain(
          "// This application owns the rest of its compiler settings."
        );
        expect(yield* fs.readFileString("/source/apps/web/tsconfig.json")).toBe(
          original
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects incompatible requirements for the same consumer before publishing files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("bindings");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "conflicting-site",
          selection: {
            addOns: ["metrics", "older-toolchain"],
            providers: {},
          },
          source: { kind: "working-tree", root: "/source" },
        });
        const error = yield* workspace
          .materialize({ install: "skip" })
          .pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "InvalidComposition",
          message:
            "Conflicting package requirements: apps/web/package.json devDependencies.typescript (5.9.3, catalog:)",
        });
        expect(yield* fs.exists("/application")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "applies recipe requirements to root, app and transitive package manifests before dependency traversal",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("bindings");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "metrics-site",
          selection: { addOns: ["metrics"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs
            .readFileString("/application/package.json")
            .pipe(Effect.flatMap(json))
        ).toMatchObject({
          dependencies: { "@example/metrics": "workspace:*" },
          name: "metrics-site",
          private: true,
        });
        expect(
          yield* fs
            .readFileString("/application/apps/web/package.json")
            .pipe(Effect.flatMap(json))
        ).toMatchObject({ devDependencies: { typescript: "catalog:" } });
        expect(
          yield* fs
            .readFileString("/application/packages/tokens/package.json")
            .pipe(Effect.flatMap(json))
        ).toEqual({ dependencies: {}, name: "@example/tokens" });
        expect(
          yield* fs.readFileString("/application/packages/tokens/index.ts")
        ).toBe('export const color = "blue";\n');
        expect(yield* fs.exists("/application/packages/search")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "removes unselected provider dependencies without including their packages as baseline",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("bindings");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "plain-site",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs
            .readFileString("/application/apps/web/package.json")
            .pipe(Effect.flatMap(json))
        ).toMatchObject({ dependencies: { next: "16.3.1" } });
        expect(yield* fs.exists("/application/packages")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "binds a consumer to the selected provider before following its package dependencies",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("bindings");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        const output = "/source/workspaces/editorial-site";
        expect(
          yield* fs
            .readFileString(`${output}/apps/web/package.json`)
            .pipe(Effect.flatMap(json))
        ).toEqual({
          custom: { keep: true },
          dependencies: {
            "@repo/cms": "workspace:@example/editorial@*",
            next: "16.3.1",
          },
          name: "web",
          private: true,
          scripts: { dev: "next dev" },
        });
        expect(
          yield* fs.readFileString(`${output}/packages/tokens/index.ts`)
        ).toBe('export const color = "blue";\n');
        expect(yield* fs.exists(`${output}/packages/archive`)).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);
