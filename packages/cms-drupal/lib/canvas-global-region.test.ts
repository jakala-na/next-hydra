import { describe, expect, it, vi } from "vitest";
import { fetchCanvasGlobalRegions } from "./canvas-global-region";

const ONE_MINUTE_MS = 60_000;

describe("fetchCanvasGlobalRegions", () => {
  it("fetches every locale-prefixed placement in one request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        cacheability: { contexts: [], maxAge: -1, tags: ["region:header"] },
        regions: {
          post_header: null,
          pre_header: { element: "announcement-banner" },
        },
        theme: "next_hydra",
      })
    );

    const result = await fetchCanvasGlobalRegions("/fr-FR/canvas/regions-api", {
      baseUrl: "https://drupal.example",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://drupal.example/fr-FR/canvas/regions-api"),
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
      }
    );
    expect(result?.regions).toEqual({
      post_header: null,
      pre_header: { element: "announcement-banner" },
    });
    expect(result?.cacheability).toEqual({
      contexts: [],
      maxAge: -1,
      tags: ["region:header"],
    });
  });

  it("marks a live authenticated result as an editable Canvas tree", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        cacheability: { contexts: [], maxAge: 0, tags: ["canvas:auto-save"] },
        regions: {
          post_header: { element: "secondary-banner" },
          pre_header: null,
        },
        theme: "next_hydra",
      })
    );

    const result = await fetchCanvasGlobalRegions("/canvas/regions-api", {
      baseUrl: "https://drupal.example",
      draftData: {
        accessToken: "preview-token",
        tokenExpiresAt: Date.now() + ONE_MINUTE_MS,
        tokenType: "Bearer",
      } as never,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://drupal.example/canvas/regions-api"),
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer preview-token",
        },
      }
    );
    expect(result?.regions).toEqual({
      post_header: {
        canvasDraftMode: true,
        element: "secondary-banner",
      },
      pre_header: {
        canvasDraftMode: true,
        element: "renderless-container",
      },
    });
    expect(result?.cacheability).toEqual({
      contexts: [],
      maxAge: 0,
      tags: ["canvas:auto-save"],
    });
  });

  it("returns null when region delivery fails", async () => {
    const rejectedFetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    await expect(
      fetchCanvasGlobalRegions("/canvas/regions-api", {
        baseUrl: "https://drupal.example",
        fetchImpl: rejectedFetch,
      })
    ).resolves.toBeNull();

    const invalidJsonFetch = vi
      .fn()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(
      fetchCanvasGlobalRegions("/canvas/regions-api", {
        baseUrl: "https://drupal.example",
        fetchImpl: invalidJsonFetch,
      })
    ).resolves.toBeNull();

    const malformedPayloadFetch = vi.fn().mockResolvedValue(
      Response.json({
        cacheability: { contexts: [], maxAge: -1, tags: [] },
        regions: null,
        theme: "next_hydra",
      })
    );
    await expect(
      fetchCanvasGlobalRegions("/canvas/regions-api", {
        baseUrl: "https://drupal.example",
        fetchImpl: malformedPayloadFetch,
      })
    ).resolves.toBeNull();
  });
});
