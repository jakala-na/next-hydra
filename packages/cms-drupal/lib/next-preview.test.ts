import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../keys", () => ({
  keys: () => ({ DRUPAL_BASE_URL: "http://localhost:8080" }),
}));
vi.stubGlobal("fetch", mocks.fetch);

import {
  isNextDrupalPreviewRequest,
  NextDrupalPreviewValidationError,
  toGraphqlRevision,
  validateNextDrupalPreview,
} from "./next-preview";

const INVALID_PREVIEW_STATUS = 422;
const SERVICE_UNAVAILABLE_STATUS = 503;

function nextPreviewParams(
  overrides: Record<string, string> = {}
): URLSearchParams {
  return new URLSearchParams({
    path: "/homepage",
    plugin: "simple_oauth",
    resourceVersion: "rel:working-copy",
    secret: "signed-secret",
    timestamp: "1722816000",
    ...overrides,
  });
}

describe("Next.js for Drupal preview validation", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
  });

  it("maps Next.js resource versions to GraphQL revisions", () => {
    expect(toGraphqlRevision("rel:working-copy")).toBe("latest");
    expect(toGraphqlRevision("rel:latest-version")).toBe("current");
    expect(toGraphqlRevision("id:42")).toBe("42");
    expect(toGraphqlRevision(null)).toBeNull();
    expect(toGraphqlRevision("unsupported")).toBeUndefined();
  });

  it("recognizes and validates a signed Next.js draft request", async () => {
    const searchParams = nextPreviewParams();
    mocks.fetch.mockResolvedValue(
      Response.json({ maxAge: 30, path: "/homepage" })
    );

    expect(isNextDrupalPreviewRequest(searchParams)).toBe(true);
    await expect(validateNextDrupalPreview(searchParams)).resolves.toEqual({
      kind: "next",
      path: "/homepage",
      revision: "latest",
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      new URL("http://localhost:8080/next/draft-url"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rejects unsupported preview requests before contacting Drupal", async () => {
    await expect(
      validateNextDrupalPreview(nextPreviewParams({ plugin: "unsupported" }))
    ).resolves.toBeUndefined();
    await expect(
      validateNextDrupalPreview(
        nextPreviewParams({ resourceVersion: "unsupported" })
      )
    ).resolves.toBeUndefined();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("distinguishes rejected signatures from Drupal service failures", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, { status: INVALID_PREVIEW_STATUS })
    );
    await expect(
      validateNextDrupalPreview(nextPreviewParams())
    ).resolves.toBeUndefined();

    mocks.fetch.mockResolvedValueOnce(
      new Response(null, { status: SERVICE_UNAVAILABLE_STATUS })
    );
    await expect(
      validateNextDrupalPreview(nextPreviewParams())
    ).rejects.toBeInstanceOf(NextDrupalPreviewValidationError);
  });

  it("wraps validation transport failures", async () => {
    const cause = new Error("fetch failed");
    mocks.fetch.mockRejectedValue(cause);

    await expect(
      validateNextDrupalPreview(nextPreviewParams())
    ).rejects.toEqual(
      new NextDrupalPreviewValidationError(
        "Failed to request Next.js for Drupal preview validation",
        { cause }
      )
    );
  });
});
