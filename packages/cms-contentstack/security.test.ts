import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Contentstack editor origins", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["NA", "https://app.contentstack.com"],
    ["EU", "https://eu-app.contentstack.com"],
    ["AU", "https://au-app.contentstack.com"],
    ["AZURE-NA", "https://azure-na-app.contentstack.com"],
    ["AZURE-EU", "https://azure-eu-app.contentstack.com"],
    ["GCP-NA", "https://gcp-na-app.contentstack.com"],
    ["GCP-EU", "https://gcp-eu-app.contentstack.com"],
  ])(
    "uses the configured %s editor instead of allowing every region",
    async (region, origin) => {
      vi.stubEnv("CONTENTSTACK_REGION", region);
      const { cmsFrameAncestors } = await import("./security");
      expect(cmsFrameAncestors).toEqual([origin]);
    }
  );

  it("rejects an unknown region instead of permitting a different editor", async () => {
    vi.stubEnv("CONTENTSTACK_REGION", "unknown-region");
    await expect(import("./security")).rejects.toThrow(/Invalid region/u);
  });
});
