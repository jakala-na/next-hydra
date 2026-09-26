import { expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";

import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";

const root = "/source/workspaces/configured-site";

it.effect(
  "distinguishes a package template from precomposed source, transitive package files and composition policy",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("packages");
      yield* Effect.gen(function* () {
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        const report = yield* workspace.explain();
        expect(report.files).toEqual(
          expect.arrayContaining([
            {
              origin: {
                bindings: [],
                kind: "template",
                owner: "app-web",
                source: "tokens.ts.template",
              },
              target: "packages/tokens/index.ts",
            },
            {
              origin: {
                kind: "source",
                owner: null,
                source: "packages/colors/index.ts",
              },
              target: "packages/colors/index.ts",
            },
            {
              origin: {
                kind: "policy",
                policy: "application-tasks",
                sources: [],
              },
              target: "turbo.json",
            },
          ])
        );
        expect(
          report.files.some(
            (file) => file.target === "packages/tokens/optional.ts"
          )
        ).toBeFalsy();
        expect(
          report.files.some(
            (file) => file.target === "packages/colors/.env.local"
          )
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "locates the canonical template before materialization without installing or writing workspace state",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        const report = yield* workspace.explain("apps/web/layout.tsx");
        expect(report.files).toEqual([
          {
            origin: {
              bindings: [],
              kind: "template",
              owner: "app-web",
              source: "layout.tsx.template",
            },
            target: "apps/web/layout.tsx",
          },
        ]);
        expect(report.sourceRoot).toBe("/source");
        expect(
          yield* Effect.all([
            fs.exists(`${root}/apps/web/layout.tsx`),
            fs.exists(`${root}/.workspace-composition.json`),
            fs.exists(`${root}/.workspace-composition.lock`),
          ])
        ).toEqual([false, false, false]);
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "explains current source without adopting local edits or reading a corrupt receipt",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        yield* fs.writeFileString(
          `${root}/apps/web/layout.tsx`,
          "Unreconciled local edit\n"
        );
        yield* fs.writeFileString(
          `${root}/.workspace-composition.json`,
          "{corrupt receipt"
        );
        const report = yield* workspace.explain("apps/web/layout.tsx");
        expect(report.files[0]?.origin).toMatchObject({
          kind: "template",
          source: "layout.tsx.template",
        });
        expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toBe(
          "Unreconciled local edit\n"
        );
        expect(
          yield* fs.readFileString(`${root}/.workspace-composition.json`)
        ).toBe("{corrupt receipt");
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "does not invent ownership for unselected files, local drafts or credentials",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        yield* fs.writeFileString(`${root}/apps/web/draft.ts`, "Local draft\n");
        yield* fs.writeFileString(
          `${root}/apps/web/.env.local`,
          "TEST_SECRET=never-report-this\n"
        );
        for (const target of [
          "apps/web/controls.tsx",
          "apps/web/draft.ts",
          "apps/web/.env.local",
        ]) {
          expect(
            yield* workspace.explain(target).pipe(Effect.flip)
          ).toMatchObject({
            _tag: "InvalidComposition",
            message: `No selected composition file: ${target}`,
          });
        }
        expect(yield* fs.readFileString(`${root}/apps/web/draft.ts`)).toBe(
          "Local draft\n"
        );
        expect(
          yield* fs.exists(`${root}/.workspace-composition.json`)
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects an explanation when its workspace definition changes during preparation",
  () =>
    Effect.gen(function* () {
      let changed = false;
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          readFile: (file) =>
            Effect.gen(function* () {
              if (!changed && file === "/source/layout.tsx.template") {
                changed = true;
                yield* fs.writeFile(
                  `${root}/next-hydra.json`,
                  yield* fs.readFile(
                    "/source/workspaces/enhanced-site/next-hydra.json"
                  )
                );
              }
              return yield* fs.readFile(file);
            }),
        }),
      });
      yield* Effect.gen(function* () {
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        expect(
          yield* workspace.explain("apps/web/layout.tsx").pipe(Effect.flip)
        ).toMatchObject({ _tag: "SourceChanged", paths: ["next-hydra.json"] });
        expect(
          yield* (yield* FileSystem.FileSystem).exists(
            `${root}/apps/web/layout.tsx`
          )
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "points to workspace-owned deployment settings instead of the registry default",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const before = yield* fs.readFile(`${root}/apps/web/vercel.json`);
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        const report = yield* workspace.explain("apps/web/vercel.json");
        expect(report.files).toEqual([
          {
            origin: {
              kind: "workspace-setting",
              source: "workspaces/configured-site/apps/web/vercel.json",
            },
            target: "apps/web/vercel.json",
          },
        ]);
        expect(yield* fs.readFile(`${root}/apps/web/vercel.json`)).toEqual(
          before
        );
        expect(
          yield* fs.exists(`${root}/.workspace-composition.json`)
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "identifies selected recipe bindings and the source to edit, then refreshes that edit",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "enhanced-site",
          sourceRoot: "/source",
        });
        const layout = yield* workspace.explain("apps/web/layout.tsx");
        expect(layout.files).toEqual([
          {
            origin: {
              bindings: [
                {
                  export: "Outer",
                  module: "./outer",
                  owner: "a-outer",
                  slot: "providers",
                  target: "apps/web/layout.tsx",
                },
                {
                  export: "Account",
                  module: "./controls",
                  owner: "account",
                  slot: "account",
                  target: "apps/web/layout.tsx",
                },
                {
                  export: "Frame",
                  module: "./controls",
                  owner: "account",
                  slot: "providers",
                  target: "apps/web/layout.tsx",
                },
              ],
              kind: "template",
              owner: "app-web",
              source: "layout.tsx.template",
            },
            target: "apps/web/layout.tsx",
          },
        ]);
        const control = yield* workspace.explain("apps/web/controls.tsx");
        const origin = control.files[0]?.origin;
        expect(origin).toEqual({
          kind: "source",
          owner: "account",
          source: "controls.tsx",
        });
        if (origin?.kind !== "source") {
          return yield* Effect.die(new Error("Expected a canonical source"));
        }
        yield* fs.writeFileString(
          `${control.sourceRoot}/${origin.source}`,
          "export const Account = () => <aside>My account</aside>;\n"
        );
        yield* workspace.sync({ install: "skip" });
        expect(
          yield* fs.readFileString(
            "/source/workspaces/enhanced-site/apps/web/controls.tsx"
          )
        ).toBe("export const Account = () => <aside>My account</aside>;\n");
      }).pipe(Effect.provide(layer));
    })
);
