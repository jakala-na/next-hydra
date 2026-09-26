import { expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { applyEdits, modify } from "jsonc-parser";

import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";
import { exampleFiles } from "./fixtures/workspace.ts";

it.effect(
  "does not let a published template read an unrelated local source file",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory("/artifacts");
        for (const [file, bytes] of yield* exampleFiles("registry")) {
          yield* fs.writeFile(`/artifacts/${file}`, bytes);
        }
        const artifact = yield* fs.readFileString("/artifacts/banner.json");
        yield* fs.writeFileString(
          "/artifacts/banner.json",
          applyEdits(
            artifact,
            modify(
              artifact,
              ["meta", "composition"],
              {
                templates: [
                  {
                    slots: { blocks: "members" },
                    source: "blocks.ts.template",
                    target: "apps/web/foreign.ts",
                  },
                ],
              },
              {}
            )
          )
        );
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "site",
          selection: { addOns: ["/artifacts/banner.json"], providers: {} },
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
  "uses an explicitly pinned repository artifact instead of the same named source item",
  () =>
    Effect.gen(function* () {
      const reference = "example/catalog/editorial#release";
      const layer = yield* memoryWorkspace("editorial", {
        registryReferences: new Map([
          [reference, "/artifacts/pinned-editorial.json"],
        ]),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const registry = yield* fs.readFileString("/source/registry.json");
        yield* fs.writeFileString(
          "/source/registry.json",
          applyEdits(
            registry,
            modify(
              registry,
              ["homepage"],
              "https://github.com/example/catalog",
              {}
            )
          )
        );
        yield* fs.makeDirectory("/artifacts");
        for (const [file, bytes] of yield* exampleFiles("registry")) {
          yield* fs.writeFile(`/artifacts/${file}`, bytes);
        }
        const original = yield* fs.readFileString("/source/article.ts");
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "site",
          selection: { addOns: [], providers: { cms: reference } },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs.readFileString("/application/apps/web/article.ts")
        ).toBe("export const article = 'Pinned release';\n");
        expect(yield* fs.readFileString("/source/article.ts")).toBe(original);
      }).pipe(Effect.provide(layer));
    })
);
