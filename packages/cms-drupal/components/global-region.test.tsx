import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", { createElement });

const mocks = vi.hoisted(() => ({
  cacheEntries: new Map<string, unknown>(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  draftMode: vi.fn().mockResolvedValue({ isEnabled: false }),
  getDraftConfig: vi.fn(),
  getDraftData: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache:
    <Argument extends string, Result>(
      callback: (argument: Argument) => Promise<Result>
    ) =>
    (argument: Argument) => {
      const existing = mocks.cacheEntries.get(argument) as
        | Promise<Result>
        | undefined;
      if (existing) {
        return existing;
      }

      const result = callback(argument);
      mocks.cacheEntries.set(argument, result);
      return result;
    },
}));
vi.mock("@drupal-canvas/headless-next", () => ({
  getDraftConfig: mocks.getDraftConfig,
  getDraftData: mocks.getDraftData,
}));
vi.mock("next/cache", () => ({
  cacheLife: mocks.cacheLife,
  cacheTag: mocks.cacheTag,
}));
vi.mock("next/headers", () => ({ draftMode: mocks.draftMode }));
vi.mock("../keys", () => ({
  keys: () => ({
    CANVAS_SITE_URL: "https://canvas.example.com",
    DRUPAL_BASE_URL: "https://drupal.example.com",
  }),
}));
vi.mock("./canvas-component-tree", () => ({
  CanvasComponentTree: () => null,
}));

import { CmsGlobalRegion } from "./global-region";

const ONE_MINUTE_MS = 60_000;
const regionNames = [
  "pre-header",
  "post-header",
  "pre-footer",
  "post-footer",
] as const;

describe("CmsGlobalRegion", () => {
  beforeEach(() => {
    mocks.cacheEntries.clear();
    mocks.cacheLife.mockReset();
    mocks.cacheTag.mockReset();
    mocks.draftMode.mockReset().mockResolvedValue({ isEnabled: false });
    mocks.getDraftConfig
      .mockReset()
      .mockReturnValue({ baseUrl: "https://canvas.example.com" });
    mocks.getDraftData.mockReset();
  });

  it("fetches all layout placements once and applies Drupal cache metadata", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        cacheability: {
          contexts: ["languages:language_interface", "oauth2_scopes", "theme"],
          maxAge: 120,
          tags: [
            "config:canvas.page_region.next_hydra.pre_header",
            "config:canvas.page_region.next_hydra.post_header",
            "config:canvas.page_region.next_hydra.pre_footer",
            "config:canvas.page_region.next_hydra.post_footer",
          ],
        },
        regions: {
          post_footer: { element: "post-footer-banner" },
          post_header: { element: "post-header-banner" },
          pre_footer: { element: "pre-footer-banner" },
          pre_header: { element: "pre-header-banner" },
        },
        theme: "next_hydra",
      })
    );
    vi.stubGlobal("fetch", fetchImpl);

    const rendered = await Promise.all(
      regionNames.map((name) => CmsGlobalRegion({ locale: "fr-FR", name }))
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://canvas.example.com/fr-FR/canvas/regions-api"),
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
      }
    );
    expect(mocks.cacheLife).toHaveBeenCalledOnce();
    expect(mocks.cacheLife).toHaveBeenCalledWith({
      expire: 120,
      revalidate: 120,
      stale: 120,
    });
    expect(mocks.cacheTag).toHaveBeenCalledOnce();
    expect(mocks.cacheTag).toHaveBeenCalledWith(
      "config:canvas.page_region.next_hydra.pre_header",
      "config:canvas.page_region.next_hydra.post_header",
      "config:canvas.page_region.next_hydra.pre_footer",
      "config:canvas.page_region.next_hydra.post_footer"
    );
    expect(rendered.map((element) => element?.props.regionId)).toEqual([
      "pre_header",
      "post_header",
      "pre_footer",
      "post_footer",
    ]);
  });

  it("keeps the batched preview request outside the published cache", async () => {
    mocks.draftMode.mockResolvedValue({ isEnabled: true });
    mocks.getDraftData.mockResolvedValue({
      accessToken: "preview-token",
      tokenExpiresAt: Date.now() + ONE_MINUTE_MS,
      tokenType: "Bearer",
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        cacheability: {
          contexts: ["oauth2_scopes"],
          maxAge: 0,
          tags: ["canvas:auto-save"],
        },
        regions: {
          post_footer: null,
          post_header: null,
          pre_footer: null,
          pre_header: { element: "draft-announcement" },
        },
        theme: "next_hydra",
      })
    );
    vi.stubGlobal("fetch", fetchImpl);

    const rendered = await Promise.all(
      regionNames.map((name) => CmsGlobalRegion({ locale: "en-US", name }))
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://canvas.example.com/canvas/regions-api"),
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer preview-token",
        },
      }
    );
    expect(mocks.cacheLife).not.toHaveBeenCalled();
    expect(mocks.cacheTag).not.toHaveBeenCalled();
    expect(rendered).not.toContain(null);
  });
});
