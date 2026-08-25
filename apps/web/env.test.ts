// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { webCmsServerEnvSchema } from "./env-schema";

describe("Web CMS environment schema", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the configured homepage slug", () => {
    expect(
      webCmsServerEnvSchema.parse({
        CMS_HOMEPAGE_SLUG: "homepage",
      }).CMS_HOMEPAGE_SLUG
    ).toBe("homepage");
  });

  it("preserves root CMS lookup by default", () => {
    expect(webCmsServerEnvSchema.parse({}).CMS_HOMEPAGE_SLUG).toBe("/");
  });

  it("reads a CMS revalidation secret", () => {
    expect(
      webCmsServerEnvSchema.parse({
        CMS_REVALIDATION_SECRET: "a-secure-cms-revalidation-secret-value",
      }).CMS_REVALIDATION_SECRET
    ).toBe("a-secure-cms-revalidation-secret-value");
  });

  it("rejects a short CMS revalidation secret", () => {
    expect(() =>
      webCmsServerEnvSchema.parse({
        CMS_REVALIDATION_SECRET: "too-short",
      })
    ).toThrow(/CMS_REVALIDATION_SECRET/u);
  });
});
