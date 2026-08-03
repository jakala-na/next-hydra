import { Effect, Option, Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductDetail } from "./generated/attributes";
import { CategoryId, ProductId, type ProductSlug } from "./identity";
import { ProductCard } from "./model";
import { ProductCollection } from "./product-collection";
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
  () => ({ ProductCollection: () => null })
);
vi.mock(
  "@repo/design-system/components/commerce/blocks/product-detail",
  () => ({ ProductDetail: () => null })
);
vi.mock("./request", () => ({
  productDiscoveryRequestLayer: requestLayer,
}));

const detail = Schema.decodeUnknownSync(ProductDetail)({
  id: "product-1",
  slug: "crawler-crane",
  productType: "generic-product",
  title: "Crawler crane",
  description: "Heavy lifting equipment",
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
  defaultVariantId: "variant-1",
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
      title: "Featured",
      categoryId: CategoryId.make("category-1"),
      excludeProductId: ProductId.make("product-2"),
      limit: 3,
      locale: "en-US",
    });

    expect(result).toBeNull();
    expect(receivedInput).toMatchObject({
      categoryId: "category-1",
      excludeProductId: "product-2",
      limit: 3,
    });
  });

  it("turns Product absence into notFound at the package boundary", async () => {
    requestLayer.mockResolvedValue(
      ProductDiscovery.testLayer({
        findBySlug: () => Effect.succeed(Option.none()),
      })
    );

    await expect(
      generateMetadataHandler({ slug: "missing", locale: "en-US" })
    ).rejects.toThrow("notFound");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("preserves Product Discovery failures instead of reporting absence", async () => {
    const failure = new ProductDiscoveryFailure({
      operation: "findBySlug",
      message: "Product detail query failed",
    });
    requestLayer.mockResolvedValue(
      ProductDiscovery.testLayer({
        findBySlug: () => Effect.fail(failure),
      })
    );

    await expect(
      generateMetadataHandler({ slug: "crawler-crane", locale: "en-US" })
    ).rejects.toThrow("Product detail query failed");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("uses a fresh request Layer for buyer-specific Product results", async () => {
    const cardFor = (id: string, title: string) =>
      Schema.decodeUnknownSync(ProductCard)({
        id,
        slug: "crawler-crane",
        title,
        availableForSale: true,
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
      title: "Featured",
      limit: 3,
      locale: "en-US",
    });
    const second = await ProductCollection({
      title: "Featured",
      limit: 3,
      locale: "en-US",
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
      slug: "crawler-crane",
      locale: "en-US",
    });
    const page = await ProductDetailPage({
      slug: "crawler-crane",
      locale: "en-US",
    });

    expect(receivedSlug).toBe("crawler-crane");
    expect(metadata).toMatchObject({
      title: "Crawler crane",
      description: "Heavy lifting equipment",
    });
    expect(page).not.toBeNull();
  });
});
