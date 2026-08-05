import { describe, expect, it, vi } from "vitest";

vi.mock("./pages/landing-page", () => {
  const LandingPage = () => null;
  LandingPage.fragment = {};

  return { LandingPage };
});

import PageRenderer, { pageMap } from "./page-renderer";

describe("Drupal PageRenderer", () => {
  it("maps supported Drupal entity types to Hydra page templates", () => {
    expect(Object.keys(pageMap)).toEqual(["NodeLandingPage"]);
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
