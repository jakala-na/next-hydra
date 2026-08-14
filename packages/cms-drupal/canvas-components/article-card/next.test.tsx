import { useLocale, useTranslations } from "@repo/i18n";
import { createElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", { createElement });

vi.mock("@repo/i18n", () => ({
  useLocale: vi.fn(() => "fr-FR"),
  useTranslations: vi.fn(
    () => (key: string) => (key === "readGuide" ? "Lire le guide" : key)
  ),
}));

vi.mock("@repo/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    `/${locale}${href}`,
}));

import CanvasArticleCard from ".";
import CanvasArticleCardNextAdapter from "./next";

describe("CanvasArticleCardNextAdapter", () => {
  it("reads Next locale context before rendering the sync component", () => {
    const article = {
      fieldSummary: "Résumé",
      id: 7,
      label: "Article",
      path: "/article",
    };

    const result = CanvasArticleCardNextAdapter({ article }) as ReactElement;

    expect(useLocale).toHaveBeenCalledOnce();
    expect(useTranslations).toHaveBeenCalledWith("web.article");
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.type).toBe(CanvasArticleCard);
    expect(result.props).toMatchObject({
      article,
      locale: "fr-FR",
      readMoreLabel: "Lire le guide",
    });
  });
});
