// @vitest-environment node

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
    ).toStrictEqual(["node:1", "node_list", "node_list:landing_page"]);
  });

  it("rejects malformed cache tags", () => {
    expect(cacheTagsFromParameter("node:1,invalid tag")).toStrictEqual([]);
    expect(cacheTagsFromParameter("node:1,<script>")).toStrictEqual([]);
  });

  it("compares configured secrets", () => {
    expect(revalidationSecretsMatch("secret", "secret")).toBeTruthy();
    expect(revalidationSecretsMatch("wrong", "secret")).toBeFalsy();
    expect(revalidationSecretsMatch(null, "secret")).toBeFalsy();
    expect(revalidationSecretsMatch("secret", undefined)).toBeFalsy();
  });
});
