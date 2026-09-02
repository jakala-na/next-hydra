import { describe, expect, it } from "vitest";

import {
  autocompleteProductHref,
  autocompleteResourceHref,
  autocompleteSearchHref,
} from "./autocomplete-routing";
import type { SearchAutocompleteRoutes } from "./autocomplete-routing";
import { decodeProductSearchHit, decodeResourceSearchHit } from "./contract";

const routes = {
  productPathPrefix: "/fr-FR/catalogue",
  resourcePathPrefix: "/fr-FR",
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
    const resource = decodeResourceSearchHit({
      objectID: "resource-1",
      resourceCard: {
        id: "resource-1",
        path: "/guides/compact-excavator",
        summary: "Choose the right machine.",
        title: "Compact excavator guide",
      },
    });

    expect(autocompleteProductHref(product, routes)).toBe(
      "/fr-FR/catalogue/compact-excavator"
    );
    expect(autocompleteResourceHref(resource, routes)).toBe(
      "/fr-FR/guides/compact-excavator"
    );
  });

  it("uses the application-composed Search route", () => {
    expect(autocompleteSearchHref(" compact excavator ", routes)).toBe(
      "/fr-FR/recherche?q=compact+excavator"
    );
  });
});
