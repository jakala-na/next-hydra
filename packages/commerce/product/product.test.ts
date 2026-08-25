import { Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  ProductAttributes,
  ProductDetail as ProductDetailType,
  ProductTypeKey,
} from "./index";
import {
  ProductAttributeDate,
  ProductAttributeDateTime,
  ProductAttributesSchemaByProductType,
  ProductAttributeTime,
  ProductCard,
  ProductDetail,
} from "./index";

describe("ProductCard", () => {
  it("decodes a provider-neutral catalog card", () => {
    const card = Schema.decodeUnknownSync(ProductCard)({
      availableForSale: true,
      description: "Heavy lifting equipment",
      featuredImage: {
        altText: "Crawler crane",
        url: "https://example.com/crawler-crane.jpg",
      },
      id: "product-1",
      slug: "crawler-crane",
      startingPrice: {
        centAmount: 125_000,
        currencyCode: "USD",
      },
      title: "Crawler crane",
    });

    expect(card).toStrictEqual({
      availableForSale: true,
      description: "Heavy lifting equipment",
      featuredImage: {
        altText: "Crawler crane",
        url: "https://example.com/crawler-crane.jpg",
      },
      id: "product-1",
      slug: "crawler-crane",
      startingPrice: {
        centAmount: 125_000,
        currencyCode: "USD",
      },
      title: "Crawler crane",
    });
  });

  it("rejects an empty title", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductCard)({
        availableForSale: true,
        id: "product-1",
        slug: "crawler-crane",
        title: "",
      })
    ).toThrow();
  });

  it("rejects a non-HTTP featured image URL", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductCard)({
        availableForSale: true,
        featuredImage: { url: "/crawler-crane.jpg" },
        id: "product-1",
        slug: "crawler-crane",
        title: "Crawler crane",
      })
    ).toThrow("absolute HTTP");
  });
});

describe("Product Attributes", () => {
  it("decodes effective Attributes for a generated Product Type", () => {
    const attributes = Schema.decodeUnknownSync(
      ProductAttributesSchemaByProductType[
        "heavy-earthmoving-and-construction-equipment"
      ]
    )({
      capacity: 80,
      iso45001: true,
      mobility: { key: "tracked", label: "Tracked" },
      model: 310,
      relatedProducts: ["product-2"],
    });

    expect(attributes).toStrictEqual({
      capacity: 80,
      iso45001: true,
      mobility: { key: "tracked", label: "Tracked" },
      model: 310,
      relatedProducts: ["product-2"],
    });
  });

  it("maps Product Type keys to their generated Attribute types", () => {
    type EarthmovingProductType = Extract<
      ProductTypeKey,
      "heavy-earthmoving-and-construction-equipment"
    >;
    type EarthmovingAttributes = ProductAttributes<EarthmovingProductType>;
    type EarthmovingDetail = ProductDetailType<EarthmovingProductType>;

    expectTypeOf<EarthmovingAttributes["model"]>().toEqualTypeOf<number>();
    expectTypeOf<
      EarthmovingDetail["variants"][number]["attributes"]
    >().toEqualTypeOf<EarthmovingAttributes>();
  });

  it("validates normalized temporal Attribute values", () => {
    expect(Schema.decodeUnknownSync(ProductAttributeDate)("2026-08-03")).toBe(
      "2026-08-03"
    );
    expect(Schema.decodeUnknownSync(ProductAttributeTime)("09:45:30")).toBe(
      "09:45:30"
    );
    expect(() =>
      Schema.decodeUnknownSync(ProductAttributeDateTime)("not-a-date-time")
    ).toThrow();
  });

  it("rejects a generated Attribute object missing a required field", () => {
    expect(() =>
      Schema.decodeUnknownSync(
        ProductAttributesSchemaByProductType[
          "heavy-earthmoving-and-construction-equipment"
        ]
      )({ mobility: { key: "tracked", label: "Tracked" } })
    ).toThrow("model");
  });

  it("rejects undeclared Attributes for a generic Product", () => {
    expect(() =>
      Schema.decodeUnknownSync(
        ProductAttributesSchemaByProductType["generic-product"]
      )({ providerField: "leak" })
    ).toThrow("providerField");
  });
});

describe("ProductDetail", () => {
  it("decodes a typed purchasable Variant projection", () => {
    const detail = Schema.decodeUnknownSync(ProductDetail)({
      categories: [
        {
          id: "category-1",
          name: "Cranes",
          slug: "cranes",
        },
      ],
      defaultVariantId: "variant-1",
      description: "Heavy lifting equipment",
      id: "product-1",
      options: [
        {
          key: "model",
          label: "Model",
          values: [{ key: "310", label: "310" }],
        },
      ],
      productType: "heavy-earthmoving-and-construction-equipment",
      slug: "crawler-crane",
      title: "Crawler crane",
      variants: [
        {
          attributes: {
            model: 310,
          },
          availability: {
            availableForSale: true,
            availableQuantity: 2,
          },
          id: "variant-1",
          images: [
            {
              altText: "Crawler crane",
              url: "https://example.com/crawler-crane.jpg",
            },
          ],
          optionValues: {
            model: "310",
          },
          price: {
            regular: {
              centAmount: 125_000,
              currencyCode: "USD",
            },
          },
          sku: "CRANE-310",
        },
      ],
    });

    expect(detail.defaultVariantId).toBe("variant-1");
    expect(detail.variants[0].attributes).toStrictEqual({ model: 310 });
    expect(detail.variants[0].optionValues).toStrictEqual({ model: "310" });
  });

  it("rejects a default Variant ID outside the Product", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductDetail)({
        categories: [],
        defaultVariantId: "variant-2",
        id: "product-1",
        options: [],
        productType: "generic-product",
        slug: "generic-product",
        title: "Generic product",
        variants: [
          {
            attributes: {},
            availability: { availableForSale: true },
            id: "variant-1",
            images: [],
            optionValues: {},
          },
        ],
      })
    ).toThrow("defaultVariantId");
  });

  it("rejects duplicate Variant IDs", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductDetail)({
        categories: [],
        defaultVariantId: "variant-1",
        id: "product-1",
        options: [],
        productType: "generic-product",
        slug: "generic-product",
        title: "Generic product",
        variants: [
          {
            attributes: {},
            availability: { availableForSale: true },
            id: "variant-1",
            images: [],
            optionValues: {},
          },
          {
            attributes: {},
            availability: { availableForSale: true },
            id: "variant-1",
            images: [],
            optionValues: {},
          },
        ],
      })
    ).toThrow("unique Product Variant IDs");
  });

  it("rejects a Variant without a declared value for every Product Option", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductDetail)({
        categories: [],
        defaultVariantId: "variant-1",
        id: "product-1",
        options: [
          {
            key: "model",
            label: "Model",
            values: [{ key: "310", label: "310" }],
          },
        ],
        productType: "heavy-earthmoving-and-construction-equipment",
        slug: "crawler-crane",
        title: "Crawler crane",
        variants: [
          {
            attributes: { model: 310 },
            availability: { availableForSale: true },
            id: "variant-1",
            images: [],
            optionValues: {},
          },
        ],
      })
    ).toThrow("every Product Option");
  });

  it("rejects a Product without a purchasable Variant", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductDetail)({
        categories: [],
        defaultVariantId: "variant-1",
        id: "product-1",
        options: [],
        productType: "generic-product",
        slug: "generic-product",
        title: "Generic product",
        variants: [],
      })
    ).toThrow();
  });

  it("rejects a negative available quantity", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductDetail)({
        categories: [],
        defaultVariantId: "variant-1",
        id: "product-1",
        options: [],
        productType: "generic-product",
        slug: "generic-product",
        title: "Generic product",
        variants: [
          {
            attributes: {},
            availability: {
              availableForSale: false,
              availableQuantity: -1,
            },
            id: "variant-1",
            images: [],
            optionValues: {},
          },
        ],
      })
    ).toThrow("greater than or equal to 0");
  });
});
