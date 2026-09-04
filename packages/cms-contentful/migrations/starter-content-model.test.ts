import { describe, expect, it } from "vitest";

import type { StarterContentType, StarterField } from "./starter-content-model";
import {
  COMPONENT_NAME_PREFIX,
  ITEM_NAME_PREFIX,
  PAGE_NAME_PREFIX,
  STARTER_CONTENT_TYPES,
} from "./starter-content-model";

const missingStarterContentType = (id: string) =>
  new Error(`Missing starter content type ${id}`);

const missingStarterField = (typeId: string, fieldId: string) =>
  new Error(`Missing starter field ${typeId}.${fieldId}`);

const contentType = (id: string): StarterContentType => {
  for (const definition of STARTER_CONTENT_TYPES) {
    if (definition.id === id) {
      return definition;
    }
  }

  throw missingStarterContentType(id);
};

const field = (typeId: string, fieldId: string): StarterField => {
  for (const definition of contentType(typeId).fields) {
    if (definition.id === fieldId) {
      return definition;
    }
  }

  throw missingStarterField(typeId, fieldId);
};

describe("starter content model catalog", () => {
  it.each([
    ["landingPage", `${PAGE_NAME_PREFIX}Landing Page`],
    ["article", `${PAGE_NAME_PREFIX}Article`],
    ["hero", `${COMPONENT_NAME_PREFIX}Hero`],
    ["featuredArticles", `${COMPONENT_NAME_PREFIX}Featured Articles`],
    [
      "dynamicProductCollection",
      `${COMPONENT_NAME_PREFIX}Dynamic Product Collection`,
    ],
    ["callToAction", `${ITEM_NAME_PREFIX}Call to Action`],
  ] as const)("names %s as %s", (id, name) => {
    expect(contentType(id).name).toBe(name);
  });

  it.each(STARTER_CONTENT_TYPES)(
    "keeps $id display names and descriptions product-neutral",
    (definition) => {
      expect(definition.description.toLowerCase()).not.toContain("next hydra");
      expect(definition.name.toLowerCase()).not.toContain("next hydra");
    }
  );

  it("enforces Drupal hero and featured-article cardinalities", () => {
    expect(field("hero", "actions").size).toEqual({ max: 2 });
    expect(field("hero", "actions").items?.linkContentTypes).toEqual([
      "callToAction",
    ]);
    expect(field("featuredArticles", "articles").size).toEqual({ max: 3 });
    expect(
      field("featuredArticles", "articles").items?.linkContentTypes
    ).toEqual(["article"]);
  });

  it("limits landing page components to the Drupal paragraph types", () => {
    expect(field("landingPage", "components").items?.linkContentTypes).toEqual([
      "dynamicProductCollection",
      "featuredArticles",
      "hero",
    ]);
  });

  it("does not localize the commerce category ID", () => {
    expect(
      field("dynamicProductCollection", "productCategory").localized
    ).toBeFalsy();
    expect(field("dynamicProductCollection", "productCategory").type).toBe(
      "Symbol"
    );
  });
});
