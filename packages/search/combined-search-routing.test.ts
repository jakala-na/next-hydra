import { describe, expect, it } from "vitest";

import {
  combinedSearchPageHref,
  combinedSearchTab,
  createCombinedSearchStateMapping,
  createCombinedSearchUrl,
  parseCombinedSearchUrl,
} from "./combined-search-routing";

const location = {
  hash: "",
  hostname: "shop.example.test",
  pathname: "/search",
  port: "",
  protocol: "https:",
};

describe("combined Search routing", () => {
  it("uses the Product index for the combined All tab", () => {
    expect(
      createCombinedSearchStateMapping("all").routeToState({ q: "excavator" })
    ).toStrictEqual({ products: { query: "excavator" } });
  });

  it("maps a one-based Resource page into InstantSearch state", () => {
    expect(
      createCombinedSearchStateMapping("resources").routeToState({
        page: "2",
        q: "excavator",
        tab: "resources",
      })
    ).toStrictEqual({ resources: { page: 2, query: "excavator" } });
  });

  it("keeps query, focused tab, and page in the public URL", () => {
    const mapping = createCombinedSearchStateMapping("products");
    const routeState = mapping.stateToRoute({
      products: { page: 2, query: "excavator" },
    });

    expect(createCombinedSearchUrl(location, routeState)).toBe(
      "https://shop.example.test/search?q=excavator&tab=products&page=2"
    );
    expect(
      parseCombinedSearchUrl("?q=excavator&tab=products&page=2")
    ).toStrictEqual({ page: "2", q: "excavator", tab: "products" });
  });

  it("falls back to All for unknown tabs", () => {
    expect(combinedSearchTab("news")).toBe("all");
  });

  it("creates a focused page link without exposing the first page", () => {
    expect(combinedSearchPageHref("excavator", "resources", 2)).toBe(
      "?q=excavator&tab=resources&page=2"
    );
    expect(combinedSearchPageHref("excavator", "resources", 1)).toBe(
      "?q=excavator&tab=resources"
    );
  });
});
