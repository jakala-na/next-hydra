import { createElement, type ReactElement, Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", { createElement });

vi.mock("../../lib/latest-articles", () => ({
  getLatestArticles: vi.fn(),
}));
vi.mock("@repo/i18n", () => ({
  getLocale: vi.fn(),
  getTranslations: vi.fn(),
}));

import CanvasLatestArticles from ".";

const EXPANDED_LIMIT = 6;

type ElementProps = {
  children?: ReactElement<ElementProps>;
  count?: number;
  description?: string;
  fallback?: ReactElement<ElementProps>;
  limit?: number;
  title?: string;
};

describe("Canvas Latest Articles streaming boundary", () => {
  it("keeps Canvas-authored copy outside the GraphQL Suspense boundary", () => {
    const result = CanvasLatestArticles({
      description: "Available immediately from Canvas",
      limit: EXPANDED_LIMIT,
      title: "Latest articles",
    }) as ReactElement<ElementProps>;

    const layout = result.props.children as ReactElement<ElementProps>;
    expect(layout.props).toMatchObject({
      description: "Available immediately from Canvas",
      title: "Latest articles",
    });

    const suspense = layout.props.children as ReactElement<ElementProps>;
    expect(suspense.type).toBe(Suspense);

    const fallback = suspense.props.fallback as ReactElement<ElementProps>;
    expect(fallback.props.count).toBe(EXPANDED_LIMIT);

    const content = suspense.props.children as ReactElement<ElementProps>;
    expect(content.props.limit).toBe(EXPANDED_LIMIT);
  });
});
