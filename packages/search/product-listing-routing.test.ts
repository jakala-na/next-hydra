import { describe, expect, it } from "vitest";

import {
  createProductListingUrl,
  parseProductListingUrl,
  productListingStateMapping,
} from "./product-listing-routing";

describe("Product listing URL state", () => {
  it("projects InstantSearch state into provider-neutral storefront parameters", () => {
    expect(
      productListingStateMapping.stateToRoute({
        products: {
          page: 1,
          refinementList: {
            availability: ["in-stock", "preorder"],
            category: ["excavators", "loaders"],
          },
          sortBy: "products@price-asc",
        },
      })
    ).toStrictEqual({
      availability: ["in-stock", "preorder"],
      category: ["excavators", "loaders"],
      sort: "price-asc",
    });
  });

  it("restores refinements, range, page, query, and sort from a storefront URL", () => {
    expect(
      productListingStateMapping.routeToState({
        availability: ["in-stock", "preorder"],
        category: ["excavators", "loaders"],
        page: "3",
        price: "1000:20000",
        q: "loader",
        sort: "price-desc",
      })
    ).toStrictEqual({
      products: {
        page: 3,
        query: "loader",
        range: { price: "1000:20000" },
        refinementList: {
          availability: ["in-stock", "preorder"],
          category: ["excavators", "loaders"],
        },
        sortBy: "products@price-desc",
      },
    });
  });

  it("serializes multi-select refinements as repeated storefront parameters", () => {
    expect(
      createProductListingUrl(
        {
          hash: "",
          hostname: "store.example.com",
          pathname: "/products",
          port: "",
          protocol: "https:",
        },
        {
          availability: "in-stock",
          category: ["excavators", "loaders"],
          sort: "price-asc",
        }
      )
    ).toBe(
      "https://store.example.com/products?category=excavators&category=loaders&availability=in-stock&sort=price-asc"
    );
  });

  it("parses repeated storefront parameters into multi-select refinements", () => {
    expect(
      parseProductListingUrl(
        "?category=excavators&category=loaders&availability=in-stock&sort=price-asc"
      )
    ).toStrictEqual({
      availability: "in-stock",
      category: ["excavators", "loaders"],
      sort: "price-asc",
    });
  });
});
