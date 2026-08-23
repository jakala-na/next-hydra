import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";

import { ContentstackRecipe } from "./recipe";
import { contentstackRecipeLayer } from "./recipe-live";

describe(ContentstackRecipe, () => {
  it.effect("materializes a scoped recipe with the requested URLs", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const recipe = yield* ContentstackRecipe;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const receipt = yield* recipe.materialize({
          localUrl: "http://localhost:3001/",
          productionUrl: "https://store.example.com/",
          targetMasterLocale: "en-us",
        });
        const environments = yield* fileSystem.readFileString(
          path.join(receipt.directory, "environments", "environments.json")
        );
        const locales = yield* fileSystem.readFileString(
          path.join(receipt.directory, "locales", "locales.json")
        );

        expect(environments).toContain("http://localhost:3001");
        expect(environments).toContain("https://store.example.com");
        expect(environments).not.toContain("__NEXT_HYDRA_");
        expect(locales).toBe("{}\n");
        expect(receipt.environments).toStrictEqual([
          "development",
          "production",
        ]);
      }).pipe(
        Effect.provide(
          contentstackRecipeLayer.pipe(Layer.provideMerge(NodeServices.layer))
        )
      )
    )
  );

  it.effect("keeps English entries importable for another master locale", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const recipe = yield* ContentstackRecipe;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const receipt = yield* recipe.materialize({
          localUrl: "http://localhost:3001",
          productionUrl: "https://store.example.com",
          targetMasterLocale: "fr-fr",
        });
        const locales = yield* fileSystem.readFileString(
          path.join(receipt.directory, "locales", "locales.json")
        );

        expect(locales).toContain('"code": "en-us"');
      }).pipe(
        Effect.provide(
          contentstackRecipeLayer.pipe(Layer.provideMerge(NodeServices.layer))
        )
      )
    )
  );
});
