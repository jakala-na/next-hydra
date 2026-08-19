import { describe, expect, it } from "vitest";

import { getNodeCacheTag } from "./cache-tags";

describe("Drupal node cache tags", () => {
  it("returns a node's entity cache tag", () => {
    expect(getNodeCacheTag({ id: "42" })).toBe("node:42");
  });

  it("rejects UUIDs where Drupal's numeric entity ID is required", () => {
    expect(() =>
      getNodeCacheTag({
        id: "40cb84f8-f472-459f-9ee5-ce08c629ed5d",
      })
    ).toThrow("Expected a numeric Drupal node ID");
  });
});
