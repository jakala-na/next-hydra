import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { applyRecipeContribution } from "./recipe-contributions";

const packageRoot = path.resolve(import.meta.dirname, "../..");

describe("Contentstack recipe contributions", () => {
  it("adds Product Collection to the base recipe idempotently", async () => {
    const [contentType, contribution, entries] = await Promise.all([
      readFile(
        path.join(packageRoot, "recipe/content_types/landing_page.json"),
        "utf-8"
      ),
      readFile(
        path.join(packageRoot, "recipe/contributions/product-collection.json"),
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

    const first = applyRecipeContribution({
      contentType,
      contribution,
      entries,
    });
    const second = applyRecipeContribution({
      contentType: first.contentType,
      contribution,
      entries: first.entries,
    });

    expect(
      first.contentType.match(/dynamic_product_collection/gu)
    ).toHaveLength(1);
    expect(first.entries.match(/dynamic_product_collection/gu)).toHaveLength(1);
    expect(second).toStrictEqual(first);
  });
});
