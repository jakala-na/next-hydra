import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";

import { Workspaces } from "../src/workspaces.ts";
import { memoryFileSystem } from "./fixtures/memory-file-system.ts";
import { memoryWorkspaceServices } from "./fixtures/memory-workspace.ts";

// Own the registry and source baseline; reuse only the in-memory platform.
const dependencyWorkspace = (request: string) => {
  const registry = {
    homepage: "https://example.com",
    items: [
      {
        dependencies: ["picocolors@1.1.1"],
        files: [
          {
            path: "apps/web/package.json",
            target: "~/apps/web/package.json",
            type: "registry:file",
          },
        ],
        name: "app-web",
        type: "registry:item",
      },
      {
        dependencies: [request],
        meta: {
          nextHydra: { id: "example/add-ons/colors", kind: "add-on" },
        },
        name: "colors",
        type: "registry:item",
      },
    ],
    name: "dependency-validation",
  };
  const files = {
    "apps/web/package.json": JSON.stringify({ name: "web", private: true }),
    "package.json": JSON.stringify({
      devDependencies: { portless: "0.15.6" },
      name: "source",
    }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\nimporters: {}\n",
    "pnpm-workspace.yaml": "packages: [apps/*]\n",
    "registry.json": JSON.stringify(registry),
  };
  return memoryWorkspaceServices().pipe(
    Layer.provideMerge(
      Layer.merge(
        Path.layer,
        memoryFileSystem(
          new Map(
            Object.entries(files).map(([name, content]) => [
              `/source/${name}`,
              new TextEncoder().encode(content),
            ])
          )
        )
      )
    )
  );
};

const materialize = Effect.gen(function* () {
  const workspace = yield* (yield* Workspaces).fresh({
    destination: "/application",
    name: "color-site",
    selection: { addOns: ["colors"], providers: {} },
    source: { kind: "working-tree", root: "/source" },
  });
  return yield* workspace.materialize({ install: "skip" });
});

for (const { description, request, message } of [
  {
    description: "conflicting explicit requests for the same dependency",
    message: "Conflicting registry dependency: picocolors",
    request: "picocolors@2.0.0",
  },
  {
    description: "a dependency URL without a package name",
    message: "colors.dependencies requires explicit package names",
    request: "https://example.com/archive.tgz",
  },
]) {
  it.effect(`rejects ${description} before publishing`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const error = yield* materialize.pipe(
        Effect.match({
          onFailure: (cause) => cause,
          onSuccess: () => undefined,
        })
      );
      expect(error).toMatchObject({ _tag: "InvalidComposition" });
      expect(error?.message).toContain(message);
      expect(yield* fs.exists("/application")).toBeFalsy();
    }).pipe(Effect.provide(dependencyWorkspace(request)))
  );
}

it.effect("materializes matching explicit dependency requests", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* materialize;
    const manifest = yield* Schema.decodeEffect(
      Schema.fromJsonString(Schema.Unknown)
    )(yield* fs.readFileString("/application/package.json"));
    expect(manifest).toHaveProperty(["dependencies", "picocolors"], "1.1.1");
    expect(yield* fs.exists("/application/apps/web/package.json")).toBeTruthy();
  }).pipe(Effect.provide(dependencyWorkspace("picocolors@1.1.1")))
);
