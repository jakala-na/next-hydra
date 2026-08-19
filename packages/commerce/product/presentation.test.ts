import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ProductDetail } from "./generated/attributes";
import { ProductCard } from "./model";
import {
  toProductCardPresentation,
  toProductDetailMetadata,
  toProductDetailPresentation,
  toProductJsonLd,
} from "./presentation";

const detail = Schema.decodeUnknownSync(ProductDetail)({
  categories: [{ id: "category-1", name: "Cranes", slug: "cranes" }],
  defaultVariantId: "variant-2",
  description: "Heavy lifting equipment",
  id: "product-1",
  options: [
    {
      key: "model",
      label: "Model",
      values: [
        { key: "100", label: "100" },
        { key: "200", label: "200" },
      ],
    },
  ],
  productType: "heavy-earthmoving-and-construction-equipment",
  slug: "crawler-crane",
  title: "Crawler crane",
  variants: [
    {
      attributes: { model: 100 },
      availability: {
        availableForSale: true,
        availableQuantity: 3,
      },
      id: "variant-1",
      images: [
        {
          altText: "Model 100",
          url: "https://images.example.com/variant-1.jpg",
        },
      ],
      optionValues: { model: "100" },
      price: {
        discounted: { centAmount: 9000, currencyCode: "USD" },
        regular: { centAmount: 10_000, currencyCode: "USD" },
      },
      sku: "SKU-1",
    },
    {
      attributes: { model: 200 },
      availability: { availableForSale: false },
      id: "variant-2",
      images: [
        {
          altText: "Model 200",
          url: "https://images.example.com/variant-2.jpg",
        },
      ],
      optionValues: { model: "200" },
      sku: "SKU-2",
    },
  ],
});

describe("Product presentation", () => {
  it("maps a Product Card without exposing domain Money internals", () => {
    const card = Schema.decodeUnknownSync(ProductCard)({
      availableForSale: true,
      description: "Heavy lifting equipment",
      featuredImage: {
        altText: "Crawler crane",
        url: "https://images.example.com/card.jpg",
      },
      id: "product-1",
      slug: "crawler-crane",
      startingPrice: { centAmount: 12_500, currencyCode: "USD" },
      title: "Crawler crane",
    });

    expect(toProductCardPresentation(card)).toStrictEqual({
      currencyCode: "USD",
      description: "Heavy lifting equipment",
      id: "product-1",
      imageTitle: "Crawler crane",
      imageUrl: "https://images.example.com/card.jpg",
      isInStock: true,
      price: 125,
      slug: "crawler-crane",
      title: "Crawler crane",
    });
  });

  it("uses the explicit Default Variant and preserves quote-only pricing", () => {
    expect(toProductDetailPresentation(detail)).toStrictEqual({
      availableForSale: true,
      categoryName: "Cranes",
      defaultImage: "https://images.example.com/variant-2.jpg",
      defaultVariantId: "variant-2",
      description: "Heavy lifting equipment",
      productId: "product-1",
      title: "Crawler crane",
      variantLabel: "Model",
      variants: [
        {
          availableQuantity: 3,
          currencyCode: "USD",
          id: "variant-1",
          imageUrl: "https://images.example.com/variant-1.jpg",
          isInStock: true,
          label: "100",
          price: 100,
          salePrice: 90,
          value: "variant-1",
        },
        {
          id: "variant-2",
          imageUrl: "https://images.example.com/variant-2.jpg",
          isInStock: false,
          label: "200",
          value: "variant-2",
        },
      ],
    });
  });

  it("projects metadata and JSON-LD from the domain Product Detail", () => {
    expect(toProductDetailMetadata(detail)).toMatchObject({
      description: "Heavy lifting equipment",
      robots: { follow: true, index: true },
      title: "Crawler crane",
    });
    expect(toProductJsonLd(detail)).toStrictEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      description: "Heavy lifting equipment",
      image: "https://images.example.com/variant-2.jpg",
      name: "Crawler crane",
      offers: {
        "@type": "AggregateOffer",
        availability: "https://schema.org/InStock",
      },
    });
  });
});
