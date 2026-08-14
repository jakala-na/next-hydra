import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", { createElement });

vi.mock("@repo/design-system/components/cms/article-card", () => ({
  ArticleCard: () => null,
}));

vi.mock("@repo/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    `/${locale}${href}`,
}));

import { ArticleCard } from "@repo/design-system/components/cms/article-card";
import CanvasArticleCard, { toCanvasArticleTeaser } from ".";

describe("Canvas Article Card", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps Canvas entity-reference data into the shared article model", () => {
    vi.stubEnv("DRUPAL_BASE_URL", "https://drupal.example.com");

    expect(
      toCanvasArticleTeaser(
        {
          created: 1_786_032_000,
          fieldImage: {
            fieldMediaImage: {
              alt: "An excavator",
              height: 800,
              src: "/sites/default/files/excavator.webp",
              width: 1200,
            },
          },
          fieldSummary: "How to select equipment for the work.",
          id: 42,
          label: "Choosing an excavator",
          path: "/resources/choosing-an-excavator",
        },
        "fr-FR"
      )
    ).toMatchObject({
      href: "/fr-FR/resources/choosing-an-excavator",
      id: "42",
      image: {
        altText: "An excavator",
        height: 800,
        url: "https://drupal.example.com/sites/default/files/excavator.webp",
        width: 1200,
      },
      summary: "How to select equipment for the work.",
      title: "Choosing an excavator",
    });
  });

  it("falls back to Drupal's canonical node path", () => {
    expect(
      toCanvasArticleTeaser(
        {
          fieldSummary: "Summary",
          id: 7,
          label: "Article",
          path: "",
        },
        "en-US"
      )?.href
    ).toBe("/en-US/node/7");
  });

  it("renders a full card placeholder until an article is selected", () => {
    const html = renderToStaticMarkup(
      CanvasArticleCard({ className: "editor-card" })
    );

    expect(html).toContain("Article card");
    expect(html).toContain("Select an article");
    expect(html).toContain("aspect-[16/10]");
    expect(html).toContain("editor-card");
  });

  it("renders the shared article card synchronously after selection", () => {
    const result = CanvasArticleCard({
      article: {
        fieldSummary: "Summary",
        id: 7,
        label: "Article",
        path: "/article",
      },
      locale: "en-US",
      readMoreLabel: "Read guide",
    }) as ReactElement;

    expect(result).not.toBeInstanceOf(Promise);
    expect(result.type).toBe(ArticleCard);
    expect(result.props).toMatchObject({
      article: {
        href: "/en-US/article",
        id: "7",
        summary: "Summary",
        title: "Article",
      },
      readMoreLabel: "Read guide",
    });
  });
});
