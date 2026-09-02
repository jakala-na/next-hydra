import { describe, expect, it } from "vitest";

import { validateSearchBatch } from "./validation";

describe(validateSearchBatch, () => {
  it("accepts the portable Product listing request subset", () => {
    const requests = validateSearchBatch({
      requests: [
        {
          indexName: "products@price-asc",
          params: {
            facetFilters: [["category:excavators"], "availability:in-stock"],
            facets: ["category", "availability", "price"],
            hitsPerPage: 12,
            numericFilters: ["price>=100", "price<=20000"],
            page: 0,
            query: "",
          },
        },
        {
          indexName: "products",
          params: {
            analytics: false,
            clickAnalytics: false,
            facets: "price",
            hitsPerPage: 0,
            query: "",
          },
        },
      ],
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]?.indexName).toBe("products@price-asc");
    expect(requests[1]?.params.facets).toStrictEqual(["price"]);
  });

  it("accepts paged Resource requests without Product facets", () => {
    const requests = validateSearchBatch({
      requests: [
        {
          indexName: "resources",
          params: {
            attributesToRetrieve: ["objectID", "resourceCard"],
            hitsPerPage: 6,
            page: 1,
            query: "excavator",
          },
        },
      ],
    });

    expect(requests).toStrictEqual([
      {
        indexName: "resources",
        params: {
          attributesToRetrieve: ["objectID", "resourceCard"],
          hitsPerPage: 6,
          page: 1,
          query: "excavator",
        },
      },
    ]);
  });

  it("rejects Product facets on the Resource index", () => {
    expect(() =>
      validateSearchBatch({
        requests: [
          {
            indexName: "resources",
            params: { facets: ["category"] },
          },
        ],
      })
    ).toThrow("Resource search does not support facets");
  });

  it.each([
    [{ indexName: "physical-products", params: {} }, "logical index"],
    [{ indexName: "products", params: { filters: "store:other" } }, "filters"],
    [
      { indexName: "products", params: { facets: ["customerGroupId"] } },
      "facets",
    ],
    [{ indexName: "products", params: { hitsPerPage: 1000 } }, "hitsPerPage"],
  ])("rejects provider-native or unbounded input", (request, message) => {
    expect(() => validateSearchBatch({ requests: [request] })).toThrow(message);
  });
});
