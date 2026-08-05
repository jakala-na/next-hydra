import { describe, expect, it } from "vitest";
import {
  cacheTagsFromParameter,
  revalidationSecretsMatch,
} from "./cms-revalidation";

describe("CMS revalidation", () => {
  it("parses and deduplicates Drupal cache tags", () => {
    expect(
      cacheTagsFromParameter(
        "node:1,node_list,node_list:landing_page,node_list:landing_page"
      )
    ).toEqual(["node:1", "node_list", "node_list:landing_page"]);
  });

  it("rejects malformed cache tags", () => {
    expect(cacheTagsFromParameter("node:1,invalid tag")).toEqual([]);
    expect(cacheTagsFromParameter("node:1,<script>")).toEqual([]);
  });

  it("compares configured secrets", () => {
    expect(revalidationSecretsMatch("secret", "secret")).toBe(true);
    expect(revalidationSecretsMatch("wrong", "secret")).toBe(false);
    expect(revalidationSecretsMatch(null, "secret")).toBe(false);
    expect(revalidationSecretsMatch("secret", undefined)).toBe(false);
  });
});
