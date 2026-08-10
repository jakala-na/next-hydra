import { Effect, Option, Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductDetail } from "./generated/attributes";
import { CategoryId, ProductId, type ProductSlug } from "./identity";
import { ProductCard } from "./model";
import { ProductCollection, ProductCollectionGrid } from "./product-collection";
import { generateMetadataHandler, ProductDetailPage } from "./product-detail";
import {
  type ListProductCardsInput,
  ProductDiscovery,
  ProductDiscoveryFailure,
} from "./product-discovery";

const { notFound, requestLayer } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  requestLayer: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock(
  "@repo/design-system/components/commerce/blocks/product-collection",
  () => ({ ProductCollection: () => null, ProductGrid: () => null })
);
vi.mock(
  "@repo/design-system/components/commerce/blocks/product-detail",
  () => ({ ProductDetail: () => null })
);
vi.mock("../commerce-context/request", () => ({
  commerceRequestLayer: requestLayer,
}));

const detail = Schema.decodeUnknownSync(ProductDetail)({
  categories: [],
  defaultVariantId: "variant-1",
  description: "Heavy lifting equipment",
  id: "product-1",
  options: [],
  productType: "generic-product",
  slug: "crawler-crane",
  title: "Crawler crane",
  variants: [
    {
      attributes: {},
      availability: { availableForSale: true },
      id: "variant-1",
      images: [],
      optionValues: {},
    },
  ],
});

beforeEach(() => {
  notFound.mockClear();
  requestLayer.mockReset();
});

describe("Product boundaries", () => {
  it("passes structured collection selectors and omits an empty block", async () => {
    let receivedInput: ListProductCardsInput | undefined;
    requestLayer.mockResolvedValue(
      ProductDiscovery.testLayer({
        listCards: (input) => {
          receivedInput = input;
          return Effect.succeed([]);
        },
      })
    );

    const result = await ProductCollection({
      categoryId: CategoryId.make("category-1"),
      excludeProductId: ProductId.make("product-2"),
      limit: 3,
      locale: "en-US",
      title: "Featured",
    });

    expect(result).toBeNull();
    expect(receivedInput).toMatchObject({
      categoryId: "category-1",
      excludeProductId: "product-2",
      limit: 3,
    });
  });

  it("projects provider data into a grid without CMS presentation props", async () => {
    requestLayer.mockResolvedValue(
      ProductDiscovery.testLayer({
        listCards: () =>
          Effect.succeed([
            Schema.decodeUnknownSync(ProductCard)({
              availableForSale: true,
              id: "product-1",
              slug: "crawler-crane",
              title: "Crawler crane",
            }),
          ]),
      })
    );

    const result = await ProductCollectionGrid({
      categoryId: CategoryId.make("category-1"),
      limit: 3,
      locale: "en-US",
    });

    expect(result).toMatchObject({
      props: {
        products: [{ title: "Crawler crane" }],
      },
    });
    expect(result?.props).not.toHaveProperty("title");
    expect(result?.props).not.toHaveProperty("description");
  });

  it("turns Product absence into notFound at the package boundary", async () => {
    requestLayer.mockResolvedValue(
      ProductDiscovery.testLayer({
        findBySlug: () => Effect.succeed(Option.none()),
      })
    );

    await expect(
      generateMetadataHandler({ locale: "en-US", slug: "missing" })
    ).rejects.toThrow("notFound");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("preserves Product Discovery failures instead of reporting absence", async () => {
    const failure = new ProductDiscoveryFailure({
      message: "Product detail query failed",
      operation: "findBySlug",
    });
    requestLayer.mockResolvedValue(
      ProductDiscovery.testLayer({
        findBySlug: () => Effect.fail(failure),
      })
    );

    await expect(
      generateMetadataHandler({ locale: "en-US", slug: "crawler-crane" })
    ).rejects.toThrow("Product detail query failed");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("uses a fresh request Layer for buyer-specific Product results", async () => {
    const cardFor = (id: string, title: string) =>
      Schema.decodeUnknownSync(ProductCard)({
        availableForSale: true,
        id,
        slug: "crawler-crane",
        title,
      });
    requestLayer
      .mockResolvedValueOnce(
        ProductDiscovery.testLayer({
          listCards: () => Effect.succeed([cardFor("product-1", "Buyer A")]),
        })
      )
      .mockResolvedValueOnce(
        ProductDiscovery.testLayer({
          listCards: () => Effect.succeed([cardFor("product-1", "Buyer B")]),
        })
      );

    const first = await ProductCollection({
      limit: 3,
      locale: "en-US",
      title: "Featured",
    });
    const second = await ProductCollection({
      limit: 3,
      locale: "en-US",
      title: "Featured",
    });

    expect(requestLayer).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({
      props: { products: [{ title: "Buyer A" }] },
    });
    expect(second).toMatchObject({
      props: { products: [{ title: "Buyer B" }] },
    });
  });

  it("uses the domain Product Detail for metadata and page projection", async () => {
    let receivedSlug: ReturnType<typeof ProductSlug.make> | undefined;
    requestLayer.mockResolvedValue(
      ProductDiscovery.testLayer({
        findBySlug: (slug) => {
          receivedSlug = slug;
          return Effect.succeed(Option.some(detail));
        },
      })
    );

    const metadata = await generateMetadataHandler({
      locale: "en-US",
      slug: "crawler-crane",
    });
    const page = await ProductDetailPage({
      locale: "en-US",
      slug: "crawler-crane",
    });

    expect(receivedSlug).toBe("crawler-crane");
    expect(metadata).toMatchObject({
      description: "Heavy lifting equipment",
      title: "Crawler crane",
    });
    expect(page).not.toBeNull();
  });
});
