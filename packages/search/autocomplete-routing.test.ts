import { describe, expect, it } from "vitest";

import {
  appendSearchPath,
  autocompleteContentHref,
  autocompleteSearchHref,
} from "./autocomplete-routing";
import type { SearchAutocompleteRoutes } from "./autocomplete-routing";
import { decodeContentSearchHit } from "./contract";
import { decodeProductSearchHit } from "./product-contract";

const routes = {
  contentPathPrefix: "/fr-FR",
  productPathPrefix: "/fr-FR/catalogue",
  searchPath: "/fr-FR/recherche",
} satisfies SearchAutocompleteRoutes;

describe("autocomplete routing", () => {
  it("uses application-composed Product and Resource routes", () => {
    const product = decodeProductSearchHit({
      categories: [],
      objectID: "product-1",
      productCard: {
        availableForSale: true,
        id: "product-1",
        slug: "compact-excavator",
        title: "Compact Excavator",
      },
    });
    const content = decodeContentSearchHit({
      contentCard: {
        id: "resource-1",
        path: "/guides/compact-excavator",
        summary: "Choose the right machine.",
        title: "Compact excavator guide",
      },
      objectID: "resource-1",
    });

    expect(
      appendSearchPath(routes.productPathPrefix, product.productCard.slug)
    ).toBe("/fr-FR/catalogue/compact-excavator");
    expect(autocompleteContentHref(content, routes)).toBe(
      "/fr-FR/guides/compact-excavator"
    );
  });

  it("uses the application-composed Search route", () => {
    expect(autocompleteSearchHref(" compact excavator ", routes)).toBe(
      "/fr-FR/recherche?q=compact+excavator"
    );
  });
});
