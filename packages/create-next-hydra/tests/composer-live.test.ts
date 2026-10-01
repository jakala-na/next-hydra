import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import { Workspaces } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";

const manifestJson = Schema.fromJsonString(
  Schema.Struct({
    repositories: Schema.Unknown,
    require: Schema.Record(Schema.String, Schema.String),
  })
);

const platform = Layer.effect(
  ChildProcessSpawner.ChildProcessSpawner,
  Effect.gen(function* () {
    const live = yield* ChildProcessSpawner.ChildProcessSpawner;
    return ChildProcessSpawner.make((command) =>
      command._tag === "StandardCommand" &&
      ["composer", "ddev", "php"].includes(command.command)
        ? Effect.die("Composition must not invoke PHP dependency tools")
        : live.spawn(command)
    );
  })
).pipe(Layer.provideMerge(NodeServices.layer));

for (const { name, providers } of [
  { name: "cms", providers: { cms: "drupal" } },
  { name: "content-search", providers: { cms: "drupal", search: "algolia" } },
  {
    name: "storefront-search",
    providers: {
      auth: "workos",
      cms: "drupal",
      commerce: "commercetools",
      search: "algolia",
    },
  },
] as const) {
  it.live(`composes real Drupal Composer inputs for ${name}`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const source = path.resolve(import.meta.dirname, "../../..");
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "composer-registry-",
      });
      const workspace = yield* (yield* Workspaces).fresh({
        destination: path.join(root, "site"),
        name: "site",
        selection: {
          addOns: [],
          providers,
        },
        source: { kind: "working-tree", root: source },
      });
      yield* workspace.materialize({ git: "skip", install: "skip" });
      const app = path.join(root, "site/apps/drupal");
      const manifest = yield* fs
        .readFileString(path.join(app, "composer.json"))
        .pipe(Effect.flatMap(Schema.decodeEffect(manifestJson)));
      if (name === "cms") {
        expect(manifest.require).not.toHaveProperty(
          "application/algolia-content-search"
        );
        expect(
          yield* fs.exists(path.join(app, "recipes/search-algolia/recipe.yml"))
        ).toBeFalsy();
      } else {
        expect(manifest.require).toHaveProperty(
          "application/algolia-content-search",
          "*@dev"
        );
        expect(manifest.repositories).toHaveProperty("application-search", {
          options: { symlink: false },
          type: "path",
          url: "recipes/search-algolia",
        });
        expect(
          yield* fs.exists(path.join(app, "recipes/search-algolia/recipe.yml"))
        ).toBeTruthy();
      }
      expect(yield* fs.readFileString(path.join(app, "composer.lock"))).toBe(
        yield* fs.readFileString(path.join(source, "apps/drupal/composer.lock"))
      );
      expect(
        yield* fs.exists(path.join(app, "scripts/prepare-search.sh"))
      ).toBeFalsy();
    }).pipe(Effect.provide(liveWorkspace.pipe(Layer.provideMerge(platform))))
  );
}
