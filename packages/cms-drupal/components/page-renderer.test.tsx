import { describe, expect, it, vi } from "vitest";

vi.mock("./pages/article", () => {
  const ArticlePage = () => null;
  ArticlePage.fragment = {};
  ArticlePage.getCacheTags = () => ["node:42"];

  return { ArticlePage };
});

vi.mock("./pages/landing-page", () => {
  const LandingPage = () => null;
  LandingPage.fragment = {};
  LandingPage.getCacheTags = () => ["node:1"];

  return { LandingPage };
});

import PageRenderer, { pageMap } from "./page-renderer";

describe("Drupal PageRenderer", () => {
  it("maps supported Drupal entity types to Hydra page templates", () => {
    expect(Object.keys(pageMap)).toEqual(["NodeArticle", "NodeLandingPage"]);
  });

  it("collects cache dependencies from the selected page template", () => {
    expect(
      PageRenderer.getCacheTags({
        __typename: "NodeArticle",
      })
    ).toEqual(["node:42"]);
  });

  it("does not render unsupported Drupal route entities", () => {
    expect(
      PageRenderer({
        data: { __typename: "NodeUnsupported" },
        locale: "en-US",
      })
    ).toBeNull();
  });

  it("accepts an absent Drupal route entity", () => {
    expect(PageRenderer({ data: null, locale: "en-US" })).toBeNull();
  });
});
