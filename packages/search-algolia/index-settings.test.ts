import { createCanonicalContentSearchProjection } from "@repo/search/content-search-projection";
import { describe, expect, it } from "vitest";

import { algoliaProductFieldPath } from "./connector/commercetools/generated-product";
import { contentIndexSettings } from "./content-mapping";
import { productIndexSettings } from "./index-settings";

describe("Algolia index settings", () => {
  it("configures localized Product fields without duplicating Product records", () => {
    const settings = productIndexSettings({
      currency: "USD",
      sort: "price-asc",
      storefronts: [
        { currency: "USD", locale: "en-US" },
        { currency: "EUR", locale: "es-ES" },
      ],
    });

    expect(settings.searchableAttributes).toEqual([
      "productCard.title.en-US",
      "unordered(productCard.description.en-US)",
      "unordered(categories.label.en-US)",
      "productCard.title.es-ES",
      "unordered(productCard.description.es-ES)",
      "unordered(categories.label.es-ES)",
    ]);
    expect(settings.attributesForFaceting).toEqual(
      expect.arrayContaining([
        "searchable(category.en-US)",
        "searchable(category.es-ES)",
        "availability",
        "price.USD",
        "price.EUR",
        "filterOnly(priceAudienceIds)",
      ])
    );
    expect(settings.ranking?.[0]).toBe("asc(price.USD)");
  });

  it("derives scalar and localized Algolia paths from generated Product types", () => {
    expect(algoliaProductFieldPath("attributes.capacity")).toBe(
      "attributes.capacity"
    );
    expect(algoliaProductFieldPath("variants.attributes.model")).toBe(
      "variants.attributes.model"
    );
    expect(algoliaProductFieldPath("variants.attributes.color.en-US")).toBe(
      "variants.attributes.color.en-US"
    );

    // @ts-expect-error en-NZ is not one of the generated application locales.
    algoliaProductFieldPath("variants.attributes.color.en-NZ");
    // @ts-expect-error numeric Product attributes have no localized child path.
    algoliaProductFieldPath("variants.attributes.model.en-US");
  });

  it("keeps Content locale filtering out of returned records", () => {
    const settings = contentIndexSettings(
      createCanonicalContentSearchProjection("content"),
      ["en-US", "de-DE"]
    );

    expect(settings.attributesForFaceting).toContain("filterOnly(locales)");
    expect(settings.unretrievableAttributes).toEqual(["locales"]);
  });
});
