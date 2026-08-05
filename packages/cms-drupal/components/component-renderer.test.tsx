import { describe, expect, it, vi } from "vitest";

vi.mock("./blocks/dynamic-product-collection", () => {
  const DynamicProductCollection = () => null;
  DynamicProductCollection.fragment = {};

  return { DynamicProductCollection };
});

vi.mock("./blocks/featured-articles", () => {
  const FeaturedArticles = () => null;
  FeaturedArticles.fragment = {};
  FeaturedArticles.getCacheTags = () => ["node:42"];

  return { FeaturedArticles };
});

vi.mock("./blocks/hero-section", () => {
  const HeroSection = () => null;
  HeroSection.fragment = {};

  return { HeroSection };
});

import ComponentRenderer, { componentMap } from "./component-renderer";

describe("Drupal ComponentRenderer", () => {
  it("maps supported paragraph types to their Hydra adapters", () => {
    expect(Object.keys(componentMap)).toEqual([
      "ParagraphDynamicProductCollection",
      "ParagraphFeaturedArticle",
      "ParagraphHero",
    ]);
  });

  it("collects cache dependencies from a supported paragraph", () => {
    expect(
      ComponentRenderer.getCacheTags({
        __typename: "ParagraphFeaturedArticle",
        id: "featured",
      })
    ).toEqual(["node:42"]);
  });

  it("does not render unsupported paragraph types", () => {
    expect(
      ComponentRenderer({
        data: { __typename: "ParagraphUnsupported", id: "unsupported" },
        locale: "en-US",
      })
    ).toBeNull();
  });

  it("accepts an absent paragraph", () => {
    expect(ComponentRenderer({ data: null, locale: "en-US" })).toBeNull();
  });
});
