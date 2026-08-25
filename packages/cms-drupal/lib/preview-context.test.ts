import { describe, expect, it } from "vitest";

import {
  decodeDrupalPreviewContext,
  encodeDrupalPreviewContext,
  isSafeDrupalPreviewPath,
} from "./preview-context";

const previewContext = {
  id: "40cb84f8-f472-459f-9ee5-ce08c629ed5d",
  kind: "graphql",
  path: "/homepage",
  token: "preview-token",
} as const;

describe("Drupal preview context", () => {
  it("round-trips a validated preview session", () => {
    expect(
      decodeDrupalPreviewContext(encodeDrupalPreviewContext(previewContext))
    ).toStrictEqual(previewContext);

    const nextContext = {
      kind: "next",
      path: "/homepage",
      revision: "latest",
    } as const;
    expect(
      decodeDrupalPreviewContext(encodeDrupalPreviewContext(nextContext))
    ).toStrictEqual(nextContext);
  });

  it("rejects malformed and unsafe preview sessions", () => {
    const unsafe = Buffer.from(
      JSON.stringify({ ...previewContext, path: "//malicious.example" })
    ).toString("base64url");

    expect(decodeDrupalPreviewContext("not-json")).toBeUndefined();
    expect(decodeDrupalPreviewContext(unsafe)).toBeUndefined();
  });

  it("only accepts local absolute paths", () => {
    expect(isSafeDrupalPreviewPath("/homepage")).toBeTruthy();
    expect(isSafeDrupalPreviewPath("homepage")).toBeFalsy();
    expect(isSafeDrupalPreviewPath("//malicious.example")).toBeFalsy();
  });
});
