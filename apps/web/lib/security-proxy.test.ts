// @vitest-environment node
import { cmsProxy } from "@repo/cms/proxy";
import { i18nProxy } from "@repo/i18n/proxy";
import {
  noseconeOptions,
  noseconeProxy,
  resolveFrameAncestors,
} from "@repo/security/proxy";
import type { NoseconeOptions } from "@repo/security/proxy";
import { createNEMO } from "@zanreal/nemo";
import { NextFetchEvent } from "next/dist/server/web/spec-extension/fetch-event";
import { NextRequest, NextResponse } from "next/server";
import type { NextProxy } from "next/server";
import { describe, expect, it, vi } from "vitest";

const origin = "https://web.example.test";
const policy = "frame-ancestors 'self' https://cms.example.test;";

async function execute(handler: NextProxy, path: string) {
  const request = new NextRequest(new URL(path, origin), {
    headers: { "content-security-policy": "frame-ancestors *" },
  });
  return await handler(
    request,
    new NextFetchEvent({ context: undefined, page: path, request })
  );
}

describe("Web security policy", () => {
  it.each(["https://app.contentstack.com", "https://drupal.example.test"])(
    "adds configured embedding origins alongside provider %s",
    async (providerOrigin) => {
      const options = {
        ...noseconeOptions,
        contentSecurityPolicy: {
          directives: {
            frameAncestors: resolveFrameAncestors(
              [providerOrigin],
              [
                "https://editor.example.test:8443",
                "https://portal.example.test",
              ]
            ),
          },
        },
        xFrameOptions: false,
      };
      const response = await execute(
        // SAFETY: These fixture values are exact HTTP(S) origins accepted by Nosecone.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Nosecone's beta declarations require literal hostname patterns.
        noseconeProxy(options as NoseconeOptions),
        "/article"
      );
      expect(response?.headers.get("content-security-policy")).toBe(
        `frame-ancestors 'self' ${providerOrigin} https://editor.example.test:8443 https://portal.example.test;`
      );
      expect(response?.headers.has("x-frame-options")).toBeFalsy();
    }
  );

  it.each([
    ["/article", "x-middleware-rewrite", `${origin}/en-US/article`],
    ["/fr-FR/article", "x-middleware-next", "1"],
    ["/en-US/article", "location", `${origin}/article`],
  ])(
    "keeps the app-owned policy through CMS and locale handling: %s",
    async (path, header, value) => {
      const security = noseconeProxy({
        ...noseconeOptions,
        contentSecurityPolicy: {
          directives: {
            frameAncestors: ["'self'", "https://cms.example.test"],
          },
        },
        crossOriginEmbedderPolicy: false,
        xFrameOptions: false,
      });
      const response = await execute(
        createNEMO({}, { before: [security, cmsProxy, i18nProxy] }),
        path
      );
      expect(response?.headers.get("content-security-policy")).toBe(policy);
      expect(response?.headers.get(header)).toBe(value);
      expect(response?.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response?.headers.has("x-frame-options")).toBeFalsy();
      expect(response?.headers.has("cross-origin-embedder-policy")).toBeFalsy();
    }
  );

  it("preserves Nosecone headers when the next callback redirects to CMS preview", async () => {
    const security = noseconeProxy({
      ...noseconeOptions,
      contentSecurityPolicy: { directives: { frameAncestors: ["'self'"] } },
    });
    const redirect = vi.fn<() => NextResponse>(() =>
      NextResponse.redirect(new URL("/api/draft", origin))
    );
    const response = await execute(
      createNEMO({}, { before: [security, redirect] }),
      "/article"
    );
    expect(redirect).toHaveBeenCalledOnce();
    expect(response?.status).toBe(307);
    expect(response?.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'self';"
    );
    expect(response?.headers.get("location")).toBe(`${origin}/api/draft`);
  });
});
