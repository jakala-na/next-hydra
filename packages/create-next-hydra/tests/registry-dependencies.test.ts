import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Schema } from "effect";
import { applyEdits, modify } from "jsonc-parser";

import { Workspaces } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";
import { fixture } from "./fixtures/workspace.ts";

const json = Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown));

for (const { dependencyPath, description } of [
  {
    dependencyPath: ["items", 2, "registryDependencies"],
    description: "an unselected provider",
  },
  {
    dependencyPath: [
      "items",
      0,
      "meta",
      "nextHydra",
      "conditionalDependencies",
      0,
      "items",
    ],
    description: "an inactive conditional recipe",
  },
]) {
  it.effect(`does not acquire unavailable dependencies of ${description}`, () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("conditional");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const registry = yield* fs.readFileString("/source/registry.json");
        yield* fs.writeFileString(
          "/source/registry.json",
          applyEdits(
            registry,
            modify(
              registry,
              dependencyPath,
              ["https://unavailable.example/recipe.json"],
              {}
            )
          )
        );
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "editorial-site",
          selection: { addOns: [], providers: { cms: "editorial" } },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs.readFileString("/application/apps/web/article.ts")
        ).toBe(yield* fs.readFileString("/source/article.ts"));
      }).pipe(Effect.provide(layer));
    })
  );
}

it.effect(
  "removes deselected root dependencies on refresh while retaining application tooling",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = "/source/workspaces/editorial-site";
        const definition = yield* fs.readFileString(`${root}/next-hydra.json`);
        yield* fs.writeFileString(
          `${root}/next-hydra.json`,
          applyEdits(
            definition,
            modify(definition, ["addOns"], ["root-dependencies"], {})
          )
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        expect(
          yield* json(yield* fs.readFileString(`${root}/package.json`))
        ).toHaveProperty(["dependencies", "picocolors"], "1.1.1");
        yield* fs.writeFileString(`${root}/next-hydra.json`, definition);
        yield* workspace.sync({ install: "skip" });
        const manifest = yield* json(
          yield* fs.readFileString(`${root}/package.json`)
        );
        expect(manifest).not.toHaveProperty(["dependencies", "picocolors"]);
        expect(manifest).not.toHaveProperty(["dependencies", "color-alias"]);
        expect(manifest).not.toHaveProperty(["devDependencies", "@types/node"]);
        expect(manifest).toHaveProperty(
          ["devDependencies", "portless"],
          "0.15.6"
        );
      }).pipe(Effect.provide(layer));
    })
);

for (const request of ["picocolors@2.0.0", "https://example.com/archive.tgz"]) {
  it.effect(
    `rejects an incompatible or unnamed registry dependency: ${request}`,
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
              modify(registry, ["items", 1, "dependencies"], [request], {})
            )
          );
          const workspace = yield* (yield* Workspaces).fresh({
            destination: "/application",
            name: "invalid-site",
            selection: { addOns: ["root-dependencies"], providers: {} },
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

it.live(
  "keeps npm requirements out of upstream installation while materializing through real ShadCN",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source, destination } = yield* fixture("application");
      const workspace = yield* (yield* Workspaces).fresh({
        destination,
        name: "color-site",
        selection: { addOns: ["root-dependencies"], providers: {} },
        source: { kind: "working-tree", root: source },
      });
      yield* workspace.materialize({ install: "skip" });
      expect(
        yield* json(yield* fs.readFileString(`${destination}/package.json`))
      ).toHaveProperty(["dependencies", "color-alias"], "npm:picocolors@1.1.1");
      expect(yield* fs.exists(`${destination}/node_modules`)).toBeFalsy();
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    )
);

it.effect(
  "rejects conflicting registry and package-local requests before publishing",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "conflicting-site",
          selection: {
            addOns: ["root-dependencies", "root-package-requirement"],
            providers: {},
          },
          source: { kind: "working-tree", root: "/source" },
        });
        expect(
          yield* workspace.materialize({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "InvalidComposition",
        });
        expect(yield* fs.exists("/application")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "materializes root dependencies from the selected registry graph without installing",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const sourceManifest = yield* fs.readFileString("/source/package.json");
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "color-site",
          selection: { addOns: ["root-dependencies"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        const result = yield* workspace.materialize({ install: "skip" });
        const manifest = yield* json(
          yield* fs.readFileString("/application/package.json")
        );
        expect(manifest).toMatchObject({
          dependencies: {
            "color-alias": "npm:picocolors@1.1.1",
            kleur: "latest",
            picocolors: "1.1.1",
          },
          devDependencies: { "@types/node": "24.13.3", portless: "0.15.6" },
        });
        expect(manifest).not.toHaveProperty(["devDependencies", "picocolors"]);
        expect(result.dependencies).toBe("pending");
        expect(yield* fs.exists("/application/node_modules")).toBeFalsy();
        expect(yield* fs.readFileString("/source/package.json")).toBe(
          sourceManifest
        );
      }).pipe(Effect.provide(layer));
    })
);
