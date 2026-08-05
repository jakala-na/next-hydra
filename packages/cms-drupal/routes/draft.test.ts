import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enableDrupalPreview: vi.fn(),
  isNextDrupalPreviewRequest: vi.fn(),
  validateDrupalPreview: vi.fn(),
  validateNextDrupalPreview: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/next-preview", () => ({
  isNextDrupalPreviewRequest: mocks.isNextDrupalPreviewRequest,
  NextDrupalPreviewValidationError: class extends Error {},
  validateNextDrupalPreview: mocks.validateNextDrupalPreview,
}));
vi.mock("../lib/preview", () => ({
  DrupalPreviewValidationError: class extends Error {},
  validateDrupalPreview: mocks.validateDrupalPreview,
}));
vi.mock("../lib/preview-session", () => ({
  enableDrupalPreview: mocks.enableDrupalPreview,
}));

import { DrupalPreviewValidationError } from "../lib/preview";
import { GET } from "./draft";

const id = "40cb84f8-f472-459f-9ee5-ce08c629ed5d";
const token = "preview-token";
const BAD_GATEWAY_STATUS = 502;
const BAD_REQUEST_STATUS = 400;
const TEMPORARY_REDIRECT_STATUS = 307;
const UNAUTHORIZED_STATUS = 401;

function request(query = ""): NextRequest {
  return new NextRequest(`http://localhost:3001/api/draft${query}`);
}

describe("Drupal draft route", () => {
  beforeEach(() => {
    mocks.enableDrupalPreview.mockReset();
    mocks.isNextDrupalPreviewRequest.mockReset();
    mocks.isNextDrupalPreviewRequest.mockReturnValue(false);
    mocks.validateDrupalPreview.mockReset();
    mocks.validateNextDrupalPreview.mockReset();
  });

  it("requires both a preview UUID and token", async () => {
    const response = await GET(request(`?uuid=${id}`));

    expect(response.status).toBe(BAD_REQUEST_STATUS);
    expect(mocks.validateDrupalPreview).not.toHaveBeenCalled();
    expect(mocks.enableDrupalPreview).not.toHaveBeenCalled();
  });

  it("does not enable Draft Mode for an invalid preview", async () => {
    mocks.validateDrupalPreview.mockResolvedValue(undefined);

    const response = await GET(request(`?uuid=${id}&token=${token}`));

    expect(response.status).toBe(UNAUTHORIZED_STATUS);
    expect(mocks.enableDrupalPreview).not.toHaveBeenCalled();
  });

  it("reports Drupal validation failures without enabling Draft Mode", async () => {
    mocks.validateDrupalPreview.mockRejectedValue(
      new DrupalPreviewValidationError(new Error("GraphQL failed"))
    );

    const response = await GET(request(`?uuid=${id}&token=${token}`));

    expect(response.status).toBe(BAD_GATEWAY_STATUS);
    expect(mocks.enableDrupalPreview).not.toHaveBeenCalled();
  });

  it("enables the validated session and redirects to its canonical path", async () => {
    const context = { id, kind: "graphql", path: "/homepage", token };
    mocks.validateDrupalPreview.mockResolvedValue(context);

    const response = await GET(request(`?uuid=${id}&token=${token}`));

    expect(mocks.enableDrupalPreview).toHaveBeenCalledWith(context);
    expect(response.status).toBe(TEMPORARY_REDIRECT_STATUS);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3001/homepage"
    );
  });

  it("supports the Next.js module's signed View-tab previews", async () => {
    const context = { kind: "next", path: "/homepage", revision: "latest" };
    mocks.isNextDrupalPreviewRequest.mockReturnValue(true);
    mocks.validateNextDrupalPreview.mockResolvedValue(context);

    const response = await GET(
      request(
        "?path=/homepage&plugin=simple_oauth&resourceVersion=rel:working-copy&secret=signed&timestamp=1722816000"
      )
    );

    expect(mocks.enableDrupalPreview).toHaveBeenCalledWith(context);
    expect(response.status).toBe(TEMPORARY_REDIRECT_STATUS);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3001/homepage"
    );
  });
});
