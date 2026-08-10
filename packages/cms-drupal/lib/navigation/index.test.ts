import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  draftMode: vi.fn(),
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("next/headers", () => ({ draftMode: mocks.draftMode }));
vi.mock("../../client", () => ({
  graphqlClient: () => ({ query: mocks.query }),
}));

import { getNavigation } from ".";

describe("Drupal navigation", () => {
  beforeEach(() => {
    mocks.draftMode.mockResolvedValue({ isEnabled: false });
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ data: { menu: { items: [] } } });
  });

  it("requests the menu in the mapped Drupal language", async () => {
    await getNavigation("fr-FR");

    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      langcode: "fr",
    });
  });

  it("maps the default frontend locale to Drupal English", async () => {
    await getNavigation("en-US");

    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      langcode: "en",
    });
  });
});
