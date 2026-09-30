import { describe, expect, it } from "vitest";

import type { AlgoliaCommercetoolsRawProduct } from "./generated-product";
import {
  ALGOLIA_COMMERCETOOLS_CONFIGURATION_SECRET_NAME,
  serializeAlgoliaCommercetoolsTransformationConfiguration,
  transform,
} from "./transform";
import type { AlgoliaCommercetoolsTransformationConfiguration } from "./transform";

const product = {
  attributes: { capacity: 20 },
  categories: {
    "en-US": { lvl0: ["Equipment"] },
    "es-ES": { lvl0: ["Equipos"] },
  },
  categoryKeys: {
    "en-US": ["equipment"],
    "es-ES": ["equipment"],
  },
  description: {
    "en-US": "Built for heavy work",
    "es-ES": "Construida para trabajos pesados",
  },
  name: { "en-US": "Excavator", "es-ES": "Excavadora" },
  objectID: "product-1",
  slug: { "en-US": "excavator", "es-ES": "excavadora" },
  variants: [
    {
      attributes: { model: 100 },
      id: "variant-1",
      images: [
        {
          label: "Excavator",
          url: "https://example.com/excavator.jpg",
        },
      ],
      isInStock: true,
      prices: {
        EUR: {
          min: 7000,
          priceValues: [
            {
              channelID: "north-america-id",
              id: "public-price-eur",
              value: 9000,
            },
            {
              channelID: "north-america-id",
              customerGroupID: "contractors-id",
              id: "contractor-price-eur",
              value: 7000,
            },
          ],
        },
        USD: {
          min: 9000,
          priceValues: [
            {
              channelID: "north-america-id",
              id: "public-price",
              value: 10_000,
            },
            {
              channelID: "north-america-id",
              customerGroupID: "contractors-id",
              discountedValue: 8000,
              id: "contractor-price",
              value: 9000,
            },
            {
              channelID: "north-america-id",
              customerGroupID: "unconfigured-id",
              id: "unconfigured-price",
              value: 5000,
            },
          ],
        },
      },
    },
  ],
} satisfies AlgoliaCommercetoolsRawProduct;

const configuration = {
  priceCustomerGroupIds: ["contractors-id"],
} satisfies AlgoliaCommercetoolsTransformationConfiguration;

describe(transform, () => {
  it("stores all locales once per provisioned audience price bag", async () => {
    const secrets = new Map<string, string>([
      [
        ALGOLIA_COMMERCETOOLS_CONFIGURATION_SECRET_NAME,
        serializeAlgoliaCommercetoolsTransformationConfiguration(configuration),
      ],
    ]);
    const documents = await transform(product, {
      secrets: { get: (name) => secrets.get(name) },
    });

    expect(documents).toHaveLength(2);
    expect(documents).toMatchObject([
      {
        attributes: { capacity: 20 },
        availability: "in-stock",
        categories: [
          {
            key: "equipment",
            label: { "en-US": "Equipment", "es-ES": "Equipos" },
          },
        ],
        category: {
          "en-US": ["equipment"],
          "es-ES": ["equipment"],
        },
        objectID: "product-1",
        price: { EUR: 90, USD: 100 },
        priceAudienceIds: ["public"],
        productCard: {
          availableForSale: true,
          id: "product-1",
          slug: { "en-US": "excavator", "es-ES": "excavadora" },
          startingPrice: {
            EUR: { centAmount: 9000, currencyCode: "EUR" },
            USD: { centAmount: 10_000, currencyCode: "USD" },
          },
          title: { "en-US": "Excavator", "es-ES": "Excavadora" },
        },
        variants: [{ attributes: { model: 100 }, id: "variant-1" }],
      },
      {
        objectID: "product-1--contractors-id",
        price: { EUR: 70, USD: 80 },
        priceAudienceIds: ["contractors-id"],
        productCard: {
          startingPrice: {
            EUR: { centAmount: 7000, currencyCode: "EUR" },
            USD: { centAmount: 8000, currencyCode: "USD" },
          },
        },
      },
    ]);
  });

  it("selects each variant's audience price before calculating the Product starting price", async () => {
    const documents = await transform(
      {
        ...product,
        variants: [
          {
            id: "group-priced-variant",
            prices: {
              USD: {
                min: 1000,
                priceValues: [
                  { id: "public-price", value: 1000 },
                  {
                    customerGroupID: "contractors-id",
                    id: "group-price",
                    value: 8000,
                  },
                ],
              },
            },
          },
          {
            id: "public-only-variant",
            prices: {
              USD: {
                min: 5000,
                priceValues: [{ id: "fallback-price", value: 5000 }],
              },
            },
          },
        ],
      },
      {
        secrets: {
          get: () =>
            serializeAlgoliaCommercetoolsTransformationConfiguration(
              configuration
            ),
        },
      }
    );

    expect(documents).toMatchObject([
      { price: { USD: 10 }, priceAudienceIds: ["public"] },
      {
        price: { USD: 50 },
        priceAudienceIds: ["contractors-id"],
        productCard: {
          startingPrice: { USD: { centAmount: 5000, currencyCode: "USD" } },
        },
      },
    ]);
  });

  it("projects the connector's default image URL into the Product card", async () => {
    const productWithConnectorImage = {
      ...product,
      variants: product.variants.map((variant) => ({
        ...variant,
        images: ["https://example.com/excavator.jpg"],
      })),
    } satisfies AlgoliaCommercetoolsRawProduct;
    const documents = await transform(productWithConnectorImage, {
      secrets: {
        get: () =>
          serializeAlgoliaCommercetoolsTransformationConfiguration(
            configuration
          ),
      },
    });

    expect(documents[0]?.productCard.featuredImage).toEqual({
      url: "https://example.com/excavator.jpg",
    });
  });

  it("explains when the provisioned transformation configuration is missing", async () => {
    await expect(transform(product)).rejects.toThrow(
      `Missing Algolia transformation secret ${ALGOLIA_COMMERCETOOLS_CONFIGURATION_SECRET_NAME}`
    );
  });
});
