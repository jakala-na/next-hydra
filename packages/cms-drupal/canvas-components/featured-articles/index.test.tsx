import { createElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", { createElement });

vi.mock("@repo/design-system/components/cms/blocks/article-collection", () => ({
  ArticleCollectionLayout: () => null,
}));

import { ArticleCollectionLayout } from "@repo/design-system/components/cms/blocks/article-collection";
import CanvasFeaturedArticles from ".";

describe("Canvas Featured Articles", () => {
  it("passes authored copy and article slot content to the shared layout", () => {
    const articles = <div>Article cards</div>;
    const result = CanvasFeaturedArticles({
      articles,
      description: "Selected editorial guides",
      title: "Equipment guides",
    }) as ReactElement;

    expect(result.type).toBe(ArticleCollectionLayout);
    expect(result.props).toMatchObject({
      children: articles,
      description: "Selected editorial guides",
      title: "Equipment guides",
    });
  });
});
