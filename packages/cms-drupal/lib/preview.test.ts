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

    await expect(validateDrupalPreview(id, token)).resolves.toEqual({
      id,
      kind: "graphql",
      path: "/homepage",
      token,
    });
  });

  it("rejects invalid entity types and unsafe paths", async () => {
    mocks.query.mockResolvedValueOnce({
      data: {
        preview: { __typename: "NodeArticle", path: "/article", uuid: id },
      },
    });
    mocks.query.mockResolvedValueOnce({
      data: {
        preview: {
          __typename: "NodeLandingPage",
          path: "//malicious.example",
          uuid: id,
        },
      },
    });

    await expect(validateDrupalPreview(id, token)).resolves.toBeUndefined();
    await expect(validateDrupalPreview(id, token)).resolves.toBeUndefined();
  });

  it("wraps GraphQL failures without exposing preview credentials", async () => {
    const graphqlError = new Error("GraphQL failed");
    mocks.query.mockResolvedValue({ error: graphqlError });

    await expect(validateDrupalPreview(id, token)).rejects.toEqual(
      new DrupalPreviewValidationError(graphqlError)
    );
  });
});
