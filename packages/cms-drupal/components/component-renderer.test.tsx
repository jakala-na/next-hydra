import { describe, expect, it, vi } from "vitest";

vi.mock("./blocks/dynamic-product-collection", () => {
  const DynamicProductCollection = () => null;
  DynamicProductCollection.fragment = {};

  return { DynamicProductCollection };
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
      "ParagraphHero",
    ]);
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
