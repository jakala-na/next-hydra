import { expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";

import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";

it.effect("rejects providers supplied as add-ons before materialization", () =>
  Effect.gen(function* () {
    const layer = yield* memoryWorkspace("conditional");
    yield* Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* (yield* Workspaces).fresh({
        destination: "/application",
        name: "public-site",
        selection: {
          addOns: ["example/auth/identity", "public-mode"],
          providers: { cms: "example/cms/editorial" },
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
  "expands a preset together with requested add-ons before validating the complete graph",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "preset-site",
          selection: {
            addOns: ["with-tracking"],
            preset: "example/preset/site",
          },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs.readFileString("/application/apps/web/tracking.ts")
        ).toBe('export const tracking = "enabled";\n');
        expect(
          yield* fs.readFile("/application/apps/web/public/brand.svg")
        ).toEqual(yield* fs.readFile("/source/brand.svg"));
        expect(
          yield* fs.exists("/application/apps/web/configuration-support.ts")
        ).toBeTruthy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "requires every provider in a recipe condition, not just one matching provider",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("conditional");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove("/source/account-catalog.ts");
        const workspaces = yield* Workspaces;
        const workspace = yield* workspaces.fresh({
          destination: "/application",
          name: "account-site",
          selection: {
            addOns: ["account-recommendations"],
            providers: {
              auth: "example/auth/identity",
              cms: "example/cms/editorial",
            },
          },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(yield* fs.readDirectory("/application/apps/web")).toEqual([
          "article.ts",
          "blocks.ts",
        ]);
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects a forbidden provider required by a selected add-on's recipe",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("conditional");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaces = yield* Workspaces;
        const workspace = yield* workspaces.fresh({
          destination: "/application",
          name: "public-site",
          selection: {
            addOns: ["public-mode"],
            providers: {
              auth: "example/auth/identity",
              cms: "example/cms/editorial",
            },
          },
          source: { kind: "working-tree", root: "/source" },
        });
        const error = yield* workspace
          .materialize({ install: "skip" })
          .pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "InvalidComposition",
          message: "example/recipes/public-session forbids an auth provider",
        });
        expect(yield* fs.exists("/application")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "includes nested recipes once even when their registry dependencies lead back to an earlier recipe",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("conditional");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        const report = yield* workspace.sync({ install: "skip" });
        expect(
          yield* fs.readFileString(
            "/source/workspaces/editorial-site/apps/web/account-catalog.ts"
          )
        ).toBe('export const accountCatalog = "Account catalog";\n');
        expect(
          report.files.filter(
            (file) => file === "apps/web/product-collection.ts"
          )
        ).toHaveLength(1);
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "reports a package's unmet provider requirement before publishing files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("conditional");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaces = yield* Workspaces;
        const workspace = yield* workspaces.fresh({
          destination: "/application",
          name: "editorial-site",
          selection: {
            addOns: [],
            providers: {
              cms: "example/cms/editorial",
              commerce: "example/commerce/shop",
            },
          },
          source: { kind: "working-tree", root: "/source" },
        });
        const error = yield* workspace
          .materialize({ install: "skip" })
          .pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "InvalidComposition",
          message: "example/packages/commerce requires an auth provider",
        });
        expect(yield* fs.exists("/application")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "adds a conditional recipe's files and slot bindings when its providers are selected",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("conditional");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspaces = yield* Workspaces;
        const workspace = yield* workspaces.named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        expect(
          yield* fs.readFileString(
            "/source/workspaces/editorial-site/apps/web/product-collection.ts"
          )
        ).toBe('export const productCollection = "Product collection";\n');
        expect(
          yield* fs.readFileString(
            "/source/workspaces/editorial-site/apps/web/blocks.ts"
          )
        ).toBe(
          'import { article } from "./article";\nimport { productCollection } from "./product-collection";\n\nexport const blocks = [article, productCollection];\n'
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "omits an inactive recipe without reading its missing source files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("conditional");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove("/source/product-collection.ts");
        const workspaces = yield* Workspaces;
        const workspace = yield* workspaces.fresh({
          destination: "/application",
          name: "editorial-site",
          selection: {
            addOns: [],
            providers: { cms: "example/cms/editorial" },
          },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs.readFileString("/application/apps/web/blocks.ts")
        ).toBe(
          'import { article } from "./article";\n\nexport const blocks = [article];\n'
        );
        expect(
          yield* fs.exists("/application/apps/web/product-collection.ts")
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);
