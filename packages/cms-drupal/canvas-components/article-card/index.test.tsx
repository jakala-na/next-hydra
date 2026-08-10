import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/design-system/components/cms/article-card", () => ({
  ArticleCard: () => null,
}));

vi.mock("@repo/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    `/${locale}${href}`,
}));

import { toCanvasArticleTeaser } from ".";

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
          field_image: {
            field_media_image: {
              alt: "An excavator",
              height: 800,
              src: "/sites/default/files/excavator.webp",
              width: 1200,
            },
          },
          field_summary: "How to select equipment for the work.",
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
          field_summary: "Summary",
          id: 7,
          label: "Article",
          path: "",
        },
        "en-US"
      )?.href
    ).toBe("/en-US/node/7");
  });
});
