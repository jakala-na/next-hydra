import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Schema } from "effect";
import { applyEdits, modify } from "jsonc-parser";
import { describe } from "vitest";
import { parse } from "yaml";

import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";

const json = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))
);

describe.each([
  { host: "web.my-app", name: "My App", packageName: "my-app" },
  { host: "web.my-app", name: "_My.App_", packageName: "my.app" },
  { host: "web.application", name: "!!!", packageName: "application" },
])("application identity for $name", ({ name, packageName, host }) => {
  it.effect(
    "normalizes package and host names without moving the destination",
    () =>
      Effect.gen(function* () {
        const layer = yield* memoryWorkspace("application");
        yield* Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const destination = `/projects/${name}`;
          const workspace = yield* (yield* Workspaces).fresh({
            destination,
            name,
            selection: { addOns: [], providers: {} },
            source: { kind: "working-tree", root: "/source" },
          });
          const result = yield* workspace.materialize({ install: "skip" });
          expect(result.destination).toBe(destination);
          expect(
            yield* json(yield* fs.readFileString(`${destination}/package.json`))
          ).toHaveProperty("name", packageName);
          expect(
            yield* json(
              yield* fs.readFileString(`${destination}/apps/web/package.json`)
            )
          ).toHaveProperty(["portless", "name"], host);
          expect(
            yield* fs.readFileString(`${destination}/apps/web/.env.example`)
          ).toContain(`http://${host}.localhost:1355`);
        }).pipe(Effect.provide(layer));
      })
  );
});

it.effect(
  "initializes an empty definition with the shared application and no providers",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(
          "/source/workspaces/editorial-site/next-hydra.json",
          "{}"
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        expect(
          yield* fs.exists(
            "/source/workspaces/editorial-site/apps/web/layout.tsx"
          )
        ).toBeTruthy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "applies the definition's development port and removes it when deselected",
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
            modify(definition, ["development"], { port: 4100 }, {})
          )
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        expect(
          yield* json(yield* fs.readFileString(`${root}/apps/web/package.json`))
        ).toHaveProperty(["portless", "appPort"], 4100);
        yield* fs.writeFileString(`${root}/next-hydra.json`, definition);
        yield* workspace.sync({ install: "skip" });
        expect(
          yield* json(yield* fs.readFileString(`${root}/apps/web/package.json`))
        ).not.toHaveProperty(["portless", "appPort"]);
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "gives a composed app a stable Portless host without changing its development commands",
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
        const output = "/source/workspaces/editorial-site/apps/web";
        const app = yield* fs
          .readFileString(`${output}/package.json`)
          .pipe(Effect.flatMap(json));
        expect(app.portless).toEqual({
          name: "web.editorial-site",
          script: "dev:next",
        });
        expect(app.scripts).toEqual({
          build: "next build",
          dev: "portless",
          "dev:next": "next dev",
        });
        expect(yield* fs.readFileString(`${output}/.env.example`)).toBe(
          "NEXT_PUBLIC_SITE_URL=http://web.editorial-site.localhost:1355\nNEXT_PUBLIC_OTHER_URL=http://other-web.localhost:1355\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "retains dependency versions while isolating pnpm discovery and lock importers to the composed application",
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
        const output = "/source/workspaces/editorial-site";
        const settings: unknown = parse(
          yield* fs.readFileString(`${output}/pnpm-workspace.yaml`)
        );
        expect(settings).toEqual({
          catalog: {
            next: "16.3.1",
            typescript: "npm:@typescript/typescript6@6.0.2",
          },
          onlyBuiltDependencies: ["sharp"],
          packages: ["apps/*", "packages/*"],
          patchedDependencies: {},
        });
        const lock: unknown = parse(
          yield* fs.readFileString(`${output}/pnpm-lock.yaml`)
        );
        expect(lock).toMatchObject({
          importers: {
            "apps/web": {
              dependencies: {
                next: { specifier: "catalog:", version: "16.3.1" },
              },
            },
          },
          lockfileVersion: "9.0",
          patchedDependencies: {},
          snapshots: { "next@16.3.1": {} },
        });
        expect(lock).not.toHaveProperty(["importers", "apps/other"]);
        expect(
          yield* fs.exists(`${output}/patches/unselected.patch`)
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "initializes the shared application without bringing maintainer dependencies or lifecycle scripts",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).fresh({
          destination: "/application",
          name: "garden-site",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        yield* workspace.materialize({ install: "skip" });
        const root = yield* fs
          .readFileString("/application/package.json")
          .pipe(Effect.flatMap(json));
        expect(root).toMatchObject({
          devDependencies: { portless: "0.15.6", turbo: "2.10.13" },
          engines: { node: "24.x" },
          name: "garden-site",
          packageManager: "pnpm@10.11.0",
          private: true,
        });
        expect(root.dependencies).toBeUndefined();
        expect(root.scripts).not.toHaveProperty("prepare");
        expect(root.devDependencies).not.toHaveProperty("maintainer-only");
        expect(
          yield* fs.exists("/application/apps/web/package.json")
        ).toBeTruthy();
      }).pipe(Effect.provide(layer));
    })
);
