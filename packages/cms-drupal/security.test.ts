import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Drupal editor origins", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CANVAS_SITE_URL", "https://cms.example.test:8443");
    vi.stubEnv("CANVAS_EDITOR_ORIGINS", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("exposes the configured Canvas origin without the app-owned self source", async () => {
    const { cmsFrameAncestors } = await import("./security");
    expect(cmsFrameAncestors).toEqual(["https://cms.example.test:8443"]);
  });

  it("respects the upstream editor override and rejects invalid origins", async () => {
    vi.stubEnv(
      "CANVAS_EDITOR_ORIGINS",
      "https://editor.example.test, https://editor.example.test https://*.example.test javascript:alert(1)"
    );
    const { cmsFrameAncestors } = await import("./security");
    expect(cmsFrameAncestors).toEqual(["https://editor.example.test"]);
  });

  it("preserves an explicitly empty editor allowlist", async () => {
    vi.stubEnv("CANVAS_EDITOR_ORIGINS", "");
    const { cmsFrameAncestors } = await import("./security");
    expect(cmsFrameAncestors).toEqual([]);
  });
});
