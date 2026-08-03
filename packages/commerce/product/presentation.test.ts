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
  id: "product-1",
  slug: "crawler-crane",
  productType: "heavy-earthmoving-and-construction-equipment",
  title: "Crawler crane",
  description: "Heavy lifting equipment",
  categories: [{ id: "category-1", name: "Cranes", slug: "cranes" }],
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
  variants: [
    {
      id: "variant-1",
      sku: "SKU-1",
      images: [
        {
          url: "https://images.example.com/variant-1.jpg",
          altText: "Model 100",
        },
      ],
      attributes: { model: 100 },
      optionValues: { model: "100" },
      price: {
        regular: { centAmount: 10_000, currencyCode: "USD" },
        discounted: { centAmount: 9000, currencyCode: "USD" },
      },
      availability: {
        availableForSale: true,
        availableQuantity: 3,
      },
    },
    {
      id: "variant-2",
      sku: "SKU-2",
      images: [
        {
          url: "https://images.example.com/variant-2.jpg",
          altText: "Model 200",
        },
      ],
      attributes: { model: 200 },
      optionValues: { model: "200" },
      availability: { availableForSale: false },
    },
  ],
  defaultVariantId: "variant-2",
});

describe("Product presentation", () => {
  it("maps a Product Card without exposing domain Money internals", () => {
    const card = Schema.decodeUnknownSync(ProductCard)({
      id: "product-1",
      slug: "crawler-crane",
      title: "Crawler crane",
      description: "Heavy lifting equipment",
      featuredImage: {
        url: "https://images.example.com/card.jpg",
        altText: "Crawler crane",
      },
      startingPrice: { centAmount: 12_500, currencyCode: "USD" },
      availableForSale: true,
    });

    expect(toProductCardPresentation(card)).toEqual({
      id: "product-1",
      slug: "crawler-crane",
      imageUrl: "https://images.example.com/card.jpg",
      imageTitle: "Crawler crane",
      title: "Crawler crane",
      description: "Heavy lifting equipment",
      price: 125,
      currencyCode: "USD",
      isInStock: true,
    });
  });

  it("uses the explicit Default Variant and preserves quote-only pricing", () => {
    expect(toProductDetailPresentation(detail)).toEqual({
      productId: "product-1",
      title: "Crawler crane",
      description: "Heavy lifting equipment",
      categoryName: "Cranes",
      availableForSale: true,
      defaultImage: "https://images.example.com/variant-2.jpg",
      defaultVariantId: "variant-2",
      variantLabel: "Model",
      variants: [
        {
          id: "variant-1",
          value: "variant-1",
          label: "100",
          price: 100,
          salePrice: 90,
          imageUrl: "https://images.example.com/variant-1.jpg",
          isInStock: true,
          availableQuantity: 3,
          currencyCode: "USD",
        },
        {
          id: "variant-2",
          value: "variant-2",
          label: "200",
          imageUrl: "https://images.example.com/variant-2.jpg",
          isInStock: false,
        },
      ],
    });
  });

  it("projects metadata and JSON-LD from the domain Product Detail", () => {
    expect(toProductDetailMetadata(detail)).toMatchObject({
      title: "Crawler crane",
      description: "Heavy lifting equipment",
      robots: { index: true, follow: true },
    });
    expect(toProductJsonLd(detail)).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Crawler crane",
      description: "Heavy lifting equipment",
      image: "https://images.example.com/variant-2.jpg",
      offers: {
        "@type": "AggregateOffer",
        availability: "https://schema.org/InStock",
      },
    });
  });
});
