import { expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";

import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";

it.effect(
  "omits instrumentation and its dependency closure from fresh customer source",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("demo");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/customer",
          name: "customer",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        const result = yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs.exists("/customer/packages/demo-architecture")
        ).toBeFalsy();
        const manifest = yield* fs.readFileString(
          "/customer/packages/view/package.json"
        );
        const output = yield* fs.readFileString(
          "/customer/packages/view/index.tsx"
        );

        const shell = yield* fs.readFileString(
          "/customer/packages/view/shell.tsx"
        );
        expect([manifest, output, shell].join("\n")).not.toMatch(
          /Architecture|demo-architecture/u
        );
        const articleMarkup: unknown = expect.stringContaining(
          "<article>Article</article>"
        );
        const contentMarkup: unknown = expect.stringContaining(
          "<article>Content</article>"
        );
        expect({ output, shell }).toMatchObject({
          output: articleMarkup,
          shell: contentMarkup,
        });
        expect(
          result.origins.find(
            (file) => file.target === "packages/view/shell.tsx"
          )?.origin
        ).toMatchObject({
          kind: "template",
          source: "shell.tsx.template",
          transforms: ["remove-demo-architecture"],
        });
        expect(
          result.origins.find(
            (file) => file.target === "packages/view/index.tsx"
          )?.origin
        ).toMatchObject({
          source: "packages/view/index.tsx",
          transforms: ["remove-demo-architecture"],
        });
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "retains an explicit named demo and removes its instrumentation on refresh when deselected",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("demo");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "demo",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        const root = "/source/workspaces/demo";
        const demoDependency: unknown = expect.stringContaining(
          "@repo/demo-architecture"
        );
        const demoToolbar: unknown = expect.stringContaining(
          "<ArchitectureToolbar"
        );
        const demoBoundary: unknown = expect.stringContaining(
          "<ArchitectureBoundary"
        );
        expect({
          manifest: yield* fs.readFileString(
            `${root}/packages/view/package.json`
          ),
          shell: yield* fs.readFileString(`${root}/packages/view/shell.tsx`),
          source: yield* fs.readFileString(`${root}/packages/view/index.tsx`),
          styles: yield* fs.exists(
            `${root}/packages/demo-architecture/styles.css`
          ),
        }).toMatchObject({
          manifest: demoDependency,
          shell: demoToolbar,
          source: demoBoundary,
          styles: true,
        });
        yield* fs.writeFileString(
          `${root}/next-hydra.json`,
          '{"providers":{},"demo":{"architecture":false}}'
        );
        const check = yield* workspace.check();
        const removal: unknown = expect.arrayContaining([
          { kind: "remove", target: "packages/demo-architecture/styles.css" },
        ]);
        expect(check).toMatchObject({
          changes: removal,
          ready: false,
        });
        yield* workspace.sync({ install: "skip" });
        expect(
          yield* fs.exists(`${root}/packages/demo-architecture/styles.css`)
        ).toBeFalsy();
        expect(
          yield* fs.readFileString(`${root}/packages/view/index.tsx`)
        ).not.toContain("ArchitectureBoundary");
        const explanation = yield* workspace.explain("packages/view/index.tsx");
        expect(explanation.files[0]?.origin).toMatchObject({
          transforms: ["remove-demo-architecture"],
        });
      }).pipe(Effect.provide(layer));
    })
);
