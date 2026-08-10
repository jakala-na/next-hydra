import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", { createElement });

const OVERFLOWING_CACHE_TAG_COUNT = 129;

const mocks = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  draftMode: vi.fn().mockResolvedValue({ isEnabled: false }),
  fetchDraftAwareCanvasPage: vi.fn(),
  fetchPublishedCanvasPage: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@drupal-canvas/headless-next", () => ({
  fetchPage: mocks.fetchDraftAwareCanvasPage,
  isPageRedirect: () => false,
}));
vi.mock("@drupal-canvas/headless/server", () => ({
  fetchPage: mocks.fetchPublishedCanvasPage,
}));
vi.mock("@repo/i18n", () => ({
  hasLocale: (locales: readonly string[], locale: string) =>
    locales.includes(locale),
  setRequestLocale: vi.fn(),
}));
vi.mock("@repo/i18n/routing", () => ({
  routing: { locales: ["en-US", "fr-FR"] },
}));
vi.mock("next/cache", () => ({
  cacheLife: mocks.cacheLife,
  cacheTag: mocks.cacheTag,
}));
vi.mock("next/headers", () => ({
  draftMode: mocks.draftMode,
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  permanentRedirect: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("../client", () => ({
  graphqlClient: () => ({ query: mocks.query }),
}));
vi.mock("../graphql", () => ({
  graphql: (document: string) => document,
}));
vi.mock("../keys", () => ({
  keys: () => ({
    CANVAS_SITE_URL: "https://canvas.example.com",
    DRUPAL_BASE_URL: "https://drupal.example.com",
  }),
}));
vi.mock("../lib/preview-session", () => ({
  getDrupalPreviewContext: vi.fn(),
}));
vi.mock("./canvas-component-tree", () => ({
  CanvasComponentTree: () => null,
}));
vi.mock("./page-renderer", () => {
  const PageRenderer = Object.assign(() => null, {
    fragments: [] as unknown[],
    getCacheTags: () => ["node:1"],
  });

  return {
    default: PageRenderer,
    isPageKey: (typename: string) => typename === "NodeLandingPage",
  };
});

import { Page } from "./page";

describe("localized Drupal page loading", () => {
  beforeEach(() => {
    mocks.cacheLife.mockReset();
    mocks.cacheTag.mockReset();
    mocks.draftMode.mockReset().mockResolvedValue({ isEnabled: false });
    mocks.fetchDraftAwareCanvasPage.mockReset();
    mocks.fetchPublishedCanvasPage.mockReset();
    mocks.query.mockReset();
  });

  it("caches the published Canvas payload with Drupal's dependencies", async () => {
    mocks.fetchPublishedCanvasPage.mockResolvedValue({
      cacheability: {
        contexts: ["languages:language_content", "url"],
        maxAge: -1,
        tags: ["canvas_page:2", "node:42"],
      },
      content: [],
      route: { managedByCanvas: true },
    });

    await Page({ locale: "fr-FR", url: "/resources" });

    expect(mocks.fetchPublishedCanvasPage).toHaveBeenCalledWith(
      "/fr-FR/resources",
      { baseUrl: "https://canvas.example.com" }
    );
    expect(mocks.fetchDraftAwareCanvasPage).not.toHaveBeenCalled();
    expect(mocks.cacheTag).toHaveBeenCalledWith("canvas_page:2", "node:42");
    expect(mocks.cacheLife).toHaveBeenCalledWith({
      expire: Number.POSITIVE_INFINITY,
      revalidate: Number.POSITIVE_INFINITY,
      stale: 300,
    });
  });

  it("keeps Canvas draft sessions outside the published cache", async () => {
    mocks.draftMode.mockResolvedValue({ isEnabled: true });
    mocks.fetchDraftAwareCanvasPage.mockResolvedValue({
      cacheability: {
        contexts: ["oauth2_scopes"],
        maxAge: 0,
        tags: ["canvas:auto-save"],
      },
      content: [],
      route: { managedByCanvas: true },
    });

    await Page({ locale: "fr-FR", url: "/resources" });

    expect(mocks.fetchDraftAwareCanvasPage).toHaveBeenCalledWith(
      "/fr-FR/resources"
    );
    expect(mocks.fetchPublishedCanvasPage).not.toHaveBeenCalled();
    expect(mocks.cacheTag).not.toHaveBeenCalled();
    expect(mocks.cacheLife).not.toHaveBeenCalled();
  });

  it("preserves permanent caching when Canvas dependencies exceed Next.js tag limits", async () => {
    mocks.fetchPublishedCanvasPage.mockResolvedValue({
      cacheability: {
        contexts: ["languages:language_content", "url"],
        maxAge: -1,
        tags: Array.from(
          { length: OVERFLOWING_CACHE_TAG_COUNT },
          (_, index) => `node:${index}`
        ),
      },
      content: [],
      route: { managedByCanvas: true },
    });

    await Page({ locale: "fr-FR", url: "/resources" });

    expect(mocks.cacheLife).toHaveBeenCalledWith({
      expire: Number.POSITIVE_INFINITY,
      revalidate: Number.POSITIVE_INFINITY,
      stale: 300,
    });
    expect(mocks.cacheTag).not.toHaveBeenCalled();
  });

  it("passes the mapped langcode to the GraphQL route fallback", async () => {
    mocks.fetchPublishedCanvasPage.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue({
      data: {
        route: {
          __typename: "RouteInternal",
          entity: { __typename: "NodeLandingPage", id: "1" },
        },
      },
    });

    await Page({ locale: "fr-FR", url: "/resources" });

    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      langcode: "fr",
      path: "/resources",
      revision: null,
    });
  });
});
