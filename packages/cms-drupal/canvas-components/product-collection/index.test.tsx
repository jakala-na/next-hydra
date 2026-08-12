import { createElement, type ReactElement, Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", { createElement });

vi.mock("../../lib/commerce-category", () => ({
  decodeCommerceCategoryId: () => ({
    _tag: "Some",
    value: "category-1",
  }),
}));
vi.mock("@repo/commerce/product/product-collection", () => ({
  ProductCollectionGrid: () => null,
}));
vi.mock(
  "@repo/design-system/components/architecture/architecture-boundary",
  () => ({ ArchitectureBoundary: () => null })
);
vi.mock(
  "@repo/design-system/components/commerce/blocks/product-collection",
  () => ({
    ProductCatalogSkeleton: () => null,
    ProductCollectionLayout: () => null,
  })
);
vi.mock("@repo/i18n", () => ({ getLocale: vi.fn() }));

import CanvasProductCollection from ".";

type ElementProps = {
  children?: ReactElement<ElementProps>;
  description?: string;
  fallback?: ReactElement<ElementProps>;
  title?: string;
};

describe("Canvas Product Collection streaming boundary", () => {
  it("keeps CMS-authored copy outside Suspense", () => {
    const result = CanvasProductCollection({
      categoryId: "category-1",
      description: "Available immediately from Canvas",
      limit: 3,
      title: "Featured products",
    }) as ReactElement<ElementProps>;

    const layout = result.props.children as ReactElement<ElementProps>;
    expect(layout.props).toMatchObject({
      description: "Available immediately from Canvas",
      title: "Featured products",
    });

    const suspense = layout.props.children as ReactElement<ElementProps>;
    expect(suspense.type).toBe(Suspense);
    expect(suspense.props).not.toHaveProperty("title");
    expect(suspense.props).not.toHaveProperty("description");
  });
});
