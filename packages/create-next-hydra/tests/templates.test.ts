import { expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";

import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";

it.effect(
  "nests equal-priority wrappers by registry owner, independent of add-on selection order",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const api = yield* Workspaces;
        for (const [name, addOns] of [
          ["first", ["account", "a-outer"]],
          ["second", ["a-outer", "account"]],
        ] as const) {
          const workspace = yield* api.fresh({
            destination: `/${name}`,
            name,
            selection: { addOns: [...addOns], providers: {} },
            source: { kind: "working-tree", root: "/source" },
          });
          yield* workspace.materialize({ install: "skip" });
          expect(yield* fs.readFileString(`/${name}/apps/web/layout.tsx`)).toBe(
            'import { Account } from "./controls";\nimport { Frame } from "./controls";\nimport { Outer } from "./outer";\n\nexport function Layout() {\n  return (\n    <Outer>\n      <Frame>\n        <main>\n          <header>\n            <Account />\n          </header>\n          Hello\n        </main>\n      </Frame>\n    </Outer>\n  );\n}\n'
          );
        }
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "refuses a broken template before publishing any application files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const source = yield* fs.readFileString("/source/layout.tsx.template");
        const controls = yield* fs.readFileString("/source/controls.tsx");
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          source.replace("{{providers.close}}", "")
        );
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "broken-site",
          selection: { addOns: ["account"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        expect(
          yield* workspace.materialize({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "InvalidComposition",
          message:
            "layout.tsx.template must contain exactly one {{providers.close}}",
        });
        expect(yield* fs.exists("/application")).toBeFalsy();
        expect(yield* fs.readFileString("/source/controls.tsx")).toBe(controls);
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "uses template ownership instead of copying precomposed package files back into the application",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("packages");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "tokens-site",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        expect(
          yield* fs.readFileString("/application/packages/tokens/index.ts")
        ).toBe('export const token = "canonical";\n');
        expect(
          yield* fs.exists("/application/packages/tokens/optional.ts")
        ).toBeFalsy();
        expect(
          yield* fs.readFileString("/source/packages/tokens/index.ts")
        ).toBe('export const token = "previous composition";\n');
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "uses fragment exports in GraphQL spreads and local aliases in document references",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "content-site",
          selection: { addOns: ["hero"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        const output = yield* (yield* FileSystem.FileSystem).readFileString(
          "/application/apps/web/query.ts"
        );
        expect(output).toBe(
          'import { HeroFields as HeroDocument } from "./hero-fragment";\n\nexport const document = `query Content { content { ...HeroFields } }`;\nexport const fragments = [HeroDocument];\n'
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "composes configuration wrappers and invoked environment factories",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "observed-site",
          selection: { addOns: ["instrumentation"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        const output = yield* (yield* FileSystem.FileSystem).readFileString(
          "/application/apps/web/configuration.ts"
        );
        expect(output).toBe(
          'import { configure } from "./configuration-support";\nimport { keys } from "./configuration-support";\n\nexport const config = configure({ features: [keys()] });\n'
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "omits unselected layout slots and their surrounding optional markup",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        expect(
          yield* fs.readFileString(
            "/source/workspaces/editorial-site/apps/web/layout.tsx"
          )
        ).toBe("export function Layout() {\n  return <main>Hello</main>;\n}\n");
        expect(
          yield* fs.exists(
            "/source/workspaces/editorial-site/apps/web/controls.tsx"
          )
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "renders selected wrapper and element bindings into the shared layout",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "account-site",
          selection: { addOns: ["account"], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        const output = yield* (yield* FileSystem.FileSystem).readFileString(
          "/application/apps/web/layout.tsx"
        );
        expect(output).toBe(
          'import { Account } from "./controls";\nimport { Frame } from "./controls";\n\nexport function Layout() {\n  return (\n    <Frame>\n      <main>\n        <header>\n          <Account />\n        </header>\n        Hello\n      </main>\n    </Frame>\n  );\n}\n'
        );
      }).pipe(Effect.provide(layer));
    })
);
