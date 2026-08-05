import { describe, expect, it } from "vitest";
import { getLandingPageCacheTag } from "./cache-tags";

describe("Drupal landing-page cache tags", () => {
  it("returns the resolved page's entity cache tag", () => {
    expect(getLandingPageCacheTag({ id: "42" })).toBe("node:42");
  });

  it("rejects UUIDs where Drupal's numeric entity ID is required", () => {
    expect(() =>
      getLandingPageCacheTag({
        id: "40cb84f8-f472-459f-9ee5-ce08c629ed5d",
      })
    ).toThrow("Expected a numeric Drupal node ID");
  });
});
