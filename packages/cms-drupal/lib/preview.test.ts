import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  graphqlClient: () => ({ query: mocks.query }),
}));

import { DrupalPreviewValidationError, validateDrupalPreview } from "./preview";

const id = "40cb84f8-f472-459f-9ee5-ce08c629ed5d";
const token = "preview-token";
const langcode = "fr";

describe("Drupal preview validation", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("returns the canonical path for a valid landing-page preview", async () => {
    mocks.query.mockResolvedValue({
      data: {
        preview: { __typename: "NodeLandingPage", path: "/homepage", uuid: id },
      },
    });

    await expect(validateDrupalPreview(id, token, langcode)).resolves.toEqual({
      id,
      kind: "graphql",
      path: "/homepage",
      token,
    });
    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      id,
      langcode,
      token,
    });
  });

  it("returns the canonical path for a valid article preview", async () => {
    mocks.query.mockResolvedValue({
      data: {
        preview: { __typename: "NodeArticle", path: "/article", uuid: id },
      },
    });

    await expect(validateDrupalPreview(id, token, langcode)).resolves.toEqual({
      id,
      kind: "graphql",
      path: "/article",
      token,
    });
  });

  it("rejects unsafe paths", async () => {
    mocks.query.mockResolvedValueOnce({
      data: {
        preview: {
          __typename: "NodeLandingPage",
          path: "//malicious.example",
          uuid: id,
        },
      },
    });

    await expect(
      validateDrupalPreview(id, token, langcode)
    ).resolves.toBeUndefined();
  });

  it("wraps GraphQL failures without exposing preview credentials", async () => {
    const graphqlError = new Error("GraphQL failed");
    mocks.query.mockResolvedValue({ error: graphqlError });

    await expect(validateDrupalPreview(id, token, langcode)).rejects.toEqual(
      new DrupalPreviewValidationError(graphqlError)
    );
  });
});
