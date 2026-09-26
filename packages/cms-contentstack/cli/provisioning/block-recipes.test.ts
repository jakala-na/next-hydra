import { readFile } from "node:fs/promises";
import path from "node:path";

import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer } from "effect";

import { applyBlockRecipe } from "./block-recipes";
import { ContentstackRecipe } from "./recipe";
import { contentstackRecipeLayer } from "./recipe-live";

const packageRoot = path.resolve(import.meta.dirname, "../..");

describe("Contentstack block recipes", () => {
  it.effect(
    "discovers installed block recipes before preparing the stack import",
    () =>
      Effect.gen(function* () {
        const recipe = yield* ContentstackRecipe;
        const fileSystem = yield* FileSystem.FileSystem;
        const receipt = yield* recipe.materialize({
          localUrl: "https://web.example.localhost",
          productionUrl: "https://store.example.com",
          targetMasterLocale: "en-us",
        });
        const contentType = yield* fileSystem.readFileString(
          path.join(receipt.directory, "content_types/landing_page.json")
        );
        const entries = yield* fileSystem.readFileString(
          path.join(
            receipt.directory,
            "entries/landing_page/en-us/1-entries.json"
          )
        );
        const hasUnappliedRecipes = yield* fileSystem.exists(
          path.join(receipt.directory, "recipes")
        );

        expect(contentType.match(/dynamic_product_collection/gu)).toHaveLength(
          1
        );
        expect(entries.match(/dynamic_product_collection/gu)).toHaveLength(1);
        expect(hasUnappliedRecipes).toBeFalsy();
      }).pipe(
        Effect.provide(
          contentstackRecipeLayer.pipe(Layer.provideMerge(NodeServices.layer))
        )
      )
  );

  it("adds Product Collection to the base recipe idempotently", async () => {
    const [contentType, recipe, entries] = await Promise.all([
      readFile(
        path.join(packageRoot, "recipe/content_types/landing_page.json"),
        "utf-8"
      ),
      readFile(
        path.join(packageRoot, "recipe/recipes/product-collection.json"),
        "utf-8"
      ),
      readFile(
        path.join(
          packageRoot,
          "recipe/entries/landing_page/en-us/1-entries.json"
        ),
        "utf-8"
      ),
    ]);

    expect(contentType).not.toContain("dynamic_product_collection");
    expect(entries).not.toContain("dynamic_product_collection");

    const first = applyBlockRecipe({
      contentType,
      entries,
      recipe,
    });
    const second = applyBlockRecipe({
      contentType: first.contentType,
      entries: first.entries,
      recipe,
    });

    expect(
      first.contentType.match(/dynamic_product_collection/gu)
    ).toHaveLength(1);
    expect(first.entries.match(/dynamic_product_collection/gu)).toHaveLength(1);
    expect(second).toStrictEqual(first);
  });
});
