import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  query: vi.fn(),
}));

const DEFAULT_LIMIT = 3;
const EXPANDED_LIMIT = 6;

vi.mock("next/cache", () => ({
  cacheLife: mocks.cacheLife,
  cacheTag: mocks.cacheTag,
}));

vi.mock("../client", () => ({
  graphqlClient: () => ({ query: mocks.query }),
}));

vi.mock("@repo/i18n/navigation", () => ({
  getPathname: ({ href }: { href: string }) => href,
}));

import { fetchLatestArticles, getLatestArticles } from "./latest-articles";

const article = {
  __typename: "NodeArticle",
  created: { time: "2026-08-14T10:00:00+00:00" },
  id: "42",
  image: {
    __typename: "MediaImage",
    mediaImage: {
      alt: "An excavator at a work site",
      height: 900,
      url: "https://drupal.example/sites/default/files/excavator.jpg",
      width: 1600,
    },
  },
  path: "/articles/latest-equipment-guide",
  summary: "The newest equipment guidance from the Drupal editorial team.",
  title: "Latest equipment guide",
};

describe("latest Drupal articles", () => {
  beforeEach(() => {
    mocks.cacheLife.mockReset();
    mocks.cacheTag.mockReset();
    mocks.query.mockReset();
  });

  it("loads and maps the newest localized Articles through GraphQL", async () => {
    mocks.query.mockResolvedValue({
      data: { nodeArticles: { nodes: [article] } },
    });

    await expect(fetchLatestArticles(DEFAULT_LIMIT, "en-US")).resolves.toEqual([
      expect.objectContaining({
        href: article.path,
        id: article.id,
        summary: article.summary,
        title: article.title,
      }),
    ]);
    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      langcode: "en",
      limit: DEFAULT_LIMIT,
    });
  });

  it("adds the Article list cache tag to the cached query", async () => {
    mocks.query.mockResolvedValue({
      data: { nodeArticles: { nodes: [article] } },
    });

    await getLatestArticles(EXPANDED_LIMIT, "en-GB");

    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      langcode: "en-gb",
      limit: EXPANDED_LIMIT,
    });
    expect(mocks.cacheLife).toHaveBeenCalledWith("hours");
    expect(mocks.cacheTag).toHaveBeenCalledWith("node_list:article");
  });

  it("surfaces GraphQL failures", async () => {
    const cause = new Error("GraphQL request failed");
    mocks.query.mockResolvedValue({ error: cause });

    await expect(fetchLatestArticles(DEFAULT_LIMIT, "en-US")).rejects.toThrow(
      "Failed to load the latest Drupal articles"
    );
  });
});
