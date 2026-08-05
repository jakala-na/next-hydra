import { describe, expect, it } from "vitest";
import { resolveCmsPagePath } from "./cms-routing";

describe("resolveCmsPagePath", () => {
  it.each(["homepage", "/homepage", "//homepage//"])(
    "maps the root route to the configured CMS homepage slug %s",
    (homepageSlug) => {
      expect(resolveCmsPagePath(undefined, homepageSlug)).toBe("/homepage");
    }
  );

  it("preserves the root path when no custom homepage is configured", () => {
    expect(resolveCmsPagePath(undefined, "/")).toBe("/");
  });

  it("uses the requested CMS path for non-root routes", () => {
    expect(resolveCmsPagePath(["about", "team"], "homepage")).toBe(
      "about/team"
    );
  });
});
