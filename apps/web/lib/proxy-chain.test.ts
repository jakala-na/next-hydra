// @vitest-environment node
import { setImmediate } from "node:timers/promises";

import { i18nProxy } from "@repo/i18n/proxy";
import { createNEMO } from "@zanreal/nemo";
import type { NextMiddleware } from "@zanreal/nemo";
import { NextFetchEvent } from "next/dist/server/web/spec-extension/fetch-event";
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

const origin = "https://web.example.test";
const csp = "frame-ancestors 'self' https://cms.example.test";

async function execute(
  proxy: ReturnType<typeof createNEMO>,
  path = "/article"
) {
  const request = new NextRequest(new URL(path, origin), {
    headers: { authorization: "Bearer incoming", cookie: "incoming=private" },
  });
  return await proxy(
    request,
    new NextFetchEvent({ context: undefined, page: path, request })
  );
}

async function run(middlewares: NextMiddleware[], path?: string) {
  return await execute(createNEMO({}, { before: middlewares }), path);
}

function frameResponse() {
  const response = NextResponse.next();
  response.headers.set("content-security-policy", csp);
  return response;
}

describe("NEMO response headers across the proxy chain", () => {
  it.each([
    ["/article", "x-middleware-rewrite", `${origin}/en-US/article`],
    ["/fr-FR/article", "x-middleware-next", "1"],
    ["/en-US/article", "location", `${origin}/article`],
  ])(
    "retains framing policy through next-intl for %s",
    async (path, header, value) => {
      const response = await run([frameResponse, i18nProxy], path);
      expect(response?.headers.get("content-security-policy")).toBe(csp);
      expect(response?.headers.get(header)).toBe(value);
    }
  );

  it("keeps headers visible to later middleware without copying request-only headers onto rewrites", async () => {
    const downstream =
      vi.fn<
        (requestHeader: string | null, responseHeader: string | null) => void
      >();
    const after = vi.fn<NextMiddleware>();
    const response = await execute(
      createNEMO(
        {},
        {
          after: [after],
          before: [
            (request) => {
              const headers = new Headers(request.headers);
              headers.set("x-request-only", "private");
              const result = NextResponse.next({ request: { headers } });
              result.headers.set("content-security-policy", csp);
              return result;
            },
            (request) => {
              downstream(
                request.headers.get("x-request-only"),
                request.headers.get("content-security-policy")
              );
              return NextResponse.rewrite(
                new URL("/en-US/article", request.url),
                {
                  request: { headers: request.headers },
                }
              );
            },
          ],
        }
      )
    );
    expect(downstream).toHaveBeenCalledWith("private", csp);
    expect(after).not.toHaveBeenCalled();
    expect(response?.headers.get("content-security-policy")).toBe(csp);
    expect(response?.headers.get("x-middleware-request-x-request-only")).toBe(
      "private"
    );
    for (const header of [
      "authorization",
      "cookie",
      "x-request-only",
      "x-middleware-next",
    ]) {
      expect(response?.headers.has(header)).toBeFalsy();
    }
  });

  it("uses explicit response values even when later request overrides have the same name", async () => {
    const response = await run([
      frameResponse,
      (request) => {
        const headers = new Headers(request.headers);
        headers.set("content-security-policy", "request-only-policy");
        return NextResponse.next({ request: { headers } });
      },
      () => NextResponse.redirect(new URL("/destination", origin)),
    ]);
    expect(response?.headers.get("content-security-policy")).toBe(csp);
  });

  it("lets the last explicit response value win, including on the terminal response", async () => {
    const updated = "frame-ancestors https://other.example.test";
    const middle = () =>
      NextResponse.next({ headers: { "content-security-policy": updated } });
    const response = await run([
      frameResponse,
      middle,
      () => NextResponse.redirect(new URL("/destination", origin)),
    ]);
    expect(response?.headers.get("content-security-policy")).toBe(updated);

    const terminal = NextResponse.json(
      { ok: true },
      { headers: { "content-security-policy": "default-src 'self'" } }
    );
    const json = await run([frameResponse, middle, () => terminal]);
    expect(json).toBe(terminal);
    expect(json?.headers.get("content-security-policy")).toBe(
      "default-src 'self'"
    );
    await expect(json?.json()).resolves.toEqual({ ok: true });
  });

  it.each(["Accept-Encoding, Origin", "*"])(
    "uses the terminal Vary value without combining policies: %s",
    async (terminalVary) => {
      const response = await run([
        () => NextResponse.next({ headers: { vary: "Accept-Language" } }),
        () =>
          NextResponse.next({
            headers: { vary: "accept-language, Accept-Encoding" },
          }),
        () =>
          NextResponse.rewrite(new URL("/destination", origin), {
            headers: { vary: terminalVary },
          }),
      ]);
      expect(response?.headers.get("vary")).toBe(terminalVary);
    }
  );

  it("preserves the upstream multi-cookie fix alongside response headers", async () => {
    const response = await run([
      () => {
        const result = frameResponse();
        result.cookies.set("token.0", "first");
        result.cookies.set("token.1", "second");
        return result;
      },
      (request) => {
        const result = NextResponse.next({
          request: { headers: request.headers },
        });
        result.cookies.set("preference", "dark");
        return result;
      },
      () => {
        const result = NextResponse.redirect(new URL("/destination", origin));
        result.cookies.set("token.0", "first");
        result.cookies.set("terminal", "kept");
        return result;
      },
    ]);
    expect(response?.headers.get("content-security-policy")).toBe(csp);
    const cookies = response?.headers.getSetCookie();
    expect(cookies).toHaveLength(4);
    expect(cookies).toEqual(
      expect.arrayContaining([
        "preference=dark; Path=/",
        "terminal=kept; Path=/",
        "token.0=first; Path=/",
        "token.1=second; Path=/",
      ])
    );
  });

  it("supports immutable redirect headers", async () => {
    const response = await run([
      frameResponse,
      () => Response.redirect(new URL("/destination", origin), 302),
    ]);
    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe(`${origin}/destination`);
    expect(response?.headers.get("content-security-policy")).toBe(csp);
  });

  it("does not share response headers between concurrent requests", async () => {
    const proxy = createNEMO(
      {},
      {
        before: [
          (request) =>
            NextResponse.next({
              headers: { "x-request-path": request.nextUrl.pathname },
            }),
          async (request) => {
            if (request.nextUrl.pathname === "/first") {
              await setImmediate();
            }
            return NextResponse.rewrite(new URL("/destination", origin));
          },
        ],
      }
    );
    const [first, second] = await Promise.all([
      execute(proxy, "/first"),
      execute(proxy, "/second"),
    ]);
    expect(first?.headers.get("x-request-path")).toBe("/first");
    expect(second?.headers.get("x-request-path")).toBe("/second");
  });
});
