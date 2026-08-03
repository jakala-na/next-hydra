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
      id: "product-1",
      slug: "crawler-crane",
      title: "Crawler crane",
      description: "Heavy lifting equipment",
      featuredImage: {
        url: "https://example.com/crawler-crane.jpg",
        altText: "Crawler crane",
      },
      startingPrice: {
        centAmount: 125_000,
        currencyCode: "USD",
      },
      availableForSale: true,
    });

    expect(card).toEqual({
      id: "product-1",
      slug: "crawler-crane",
      title: "Crawler crane",
      description: "Heavy lifting equipment",
      featuredImage: {
        url: "https://example.com/crawler-crane.jpg",
        altText: "Crawler crane",
      },
      startingPrice: {
        centAmount: 125_000,
        currencyCode: "USD",
      },
      availableForSale: true,
    });
  });

  it("rejects an empty title", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductCard)({
        id: "product-1",
        slug: "crawler-crane",
        title: "",
        availableForSale: true,
      })
    ).toThrow();
  });

  it("rejects a non-HTTP featured image URL", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductCard)({
        id: "product-1",
        slug: "crawler-crane",
        title: "Crawler crane",
        featuredImage: { url: "/crawler-crane.jpg" },
        availableForSale: true,
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
      relatedProducts: ["product-2"],
      mobility: { key: "tracked", label: "Tracked" },
      model: 310,
    });

    expect(attributes).toEqual({
      capacity: 80,
      iso45001: true,
      relatedProducts: ["product-2"],
      mobility: { key: "tracked", label: "Tracked" },
      model: 310,
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
      id: "product-1",
      slug: "crawler-crane",
      productType: "heavy-earthmoving-and-construction-equipment",
      title: "Crawler crane",
      description: "Heavy lifting equipment",
      categories: [
        {
          id: "category-1",
          name: "Cranes",
          slug: "cranes",
        },
      ],
      options: [
        {
          key: "model",
          label: "Model",
          values: [{ key: "310", label: "310" }],
        },
      ],
      variants: [
        {
          id: "variant-1",
          sku: "CRANE-310",
          images: [
            {
              url: "https://example.com/crawler-crane.jpg",
              altText: "Crawler crane",
            },
          ],
          attributes: {
            model: 310,
          },
          optionValues: {
            model: "310",
          },
          price: {
            regular: {
              centAmount: 125_000,
              currencyCode: "USD",
            },
          },
          availability: {
            availableForSale: true,
            availableQuantity: 2,
          },
        },
      ],
      defaultVariantId: "variant-1",
    });

    expect(detail.defaultVariantId).toBe("variant-1");
    expect(detail.variants[0].attributes).toEqual({ model: 310 });
    expect(detail.variants[0].optionValues).toEqual({ model: "310" });
  });

  it("rejects a default Variant ID outside the Product", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductDetail)({
        id: "product-1",
        slug: "generic-product",
        productType: "generic-product",
        title: "Generic product",
        categories: [],
        options: [],
        variants: [
          {
            id: "variant-1",
            images: [],
            attributes: {},
            optionValues: {},
            availability: { availableForSale: true },
          },
        ],
        defaultVariantId: "variant-2",
      })
    ).toThrow("defaultVariantId");
  });

  it("rejects duplicate Variant IDs", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductDetail)({
        id: "product-1",
        slug: "generic-product",
        productType: "generic-product",
        title: "Generic product",
        categories: [],
        options: [],
        variants: [
          {
            id: "variant-1",
            images: [],
            attributes: {},
            optionValues: {},
            availability: { availableForSale: true },
          },
          {
            id: "variant-1",
            images: [],
            attributes: {},
            optionValues: {},
            availability: { availableForSale: true },
          },
        ],
        defaultVariantId: "variant-1",
      })
    ).toThrow("unique Product Variant IDs");
  });

  it("rejects a Variant without a declared value for every Product Option", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductDetail)({
        id: "product-1",
        slug: "crawler-crane",
        productType: "heavy-earthmoving-and-construction-equipment",
        title: "Crawler crane",
        categories: [],
        options: [
          {
            key: "model",
            label: "Model",
            values: [{ key: "310", label: "310" }],
          },
        ],
        variants: [
          {
            id: "variant-1",
            images: [],
            attributes: { model: 310 },
            optionValues: {},
            availability: { availableForSale: true },
          },
        ],
        defaultVariantId: "variant-1",
      })
    ).toThrow("every Product Option");
  });

  it("rejects a Product without a purchasable Variant", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductDetail)({
        id: "product-1",
        slug: "generic-product",
        productType: "generic-product",
        title: "Generic product",
        categories: [],
        options: [],
        variants: [],
        defaultVariantId: "variant-1",
      })
    ).toThrow();
  });

  it("rejects a negative available quantity", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductDetail)({
        id: "product-1",
        slug: "generic-product",
        productType: "generic-product",
        title: "Generic product",
        categories: [],
        options: [],
        variants: [
          {
            id: "variant-1",
            images: [],
            attributes: {},
            optionValues: {},
            availability: {
              availableForSale: false,
              availableQuantity: -1,
            },
          },
        ],
        defaultVariantId: "variant-1",
      })
    ).toThrow("greater than or equal to 0");
  });
});
