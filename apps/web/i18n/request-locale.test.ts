import { hasLocale } from "@repo/i18n";
import { i18nProxy } from "@repo/i18n/proxy";
import type sharedRequestConfig from "@repo/i18n/request";
import { routing } from "@repo/i18n/routing";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { localeFromHeaders, withRootLocale } from "./request-locale";

async function echoConfig({
  requestLocale,
}: Parameters<typeof sharedRequestConfig>[0]) {
  const requested = await requestLocale;
  return {
    locale: hasLocale(routing.locales, requested)
      ? requested
      : routing.defaultLocale,
  };
}

describe("web request locale", () => {
  it("uses the root layout locale without reading middleware headers", async () => {
    const configure = withRootLocale(
      echoConfig,
      async () => await Promise.resolve("fr-FR")
    );

    await expect(
      configure({
        get requestLocale(): Promise<string | undefined> {
          throw new Error("Middleware locale must stay lazy");
        },
      })
    ).resolves.toEqual({ locale: "fr-FR" });
  });

  it("preserves explicit overrides without reading unavailable root params", async () => {
    const configure = withRootLocale(
      async (params) => {
        expect(params.locale).toBe("de-DE");
        return await echoConfig(params);
      },
      async () =>
        await Promise.reject(new Error("Root params unavailable in actions"))
    );

    await expect(
      configure({ locale: "de-DE", requestLocale: Promise.resolve("en-US") })
    ).resolves.toEqual({ locale: "de-DE" });
  });

  it("leaves missing-locale fallback to the shared configuration", async () => {
    const configure = withRootLocale(echoConfig, async () => {
      await Promise.resolve();
      return undefined;
    });

    await expect(
      configure({ requestLocale: Promise.resolve(undefined) })
    ).resolves.toEqual({
      locale: routing.defaultLocale,
    });
  });

  it("does not hide root-param failures behind a default locale", async () => {
    const configure = withRootLocale(
      echoConfig,
      async () => await Promise.reject(new Error("Missing root layout"))
    );

    await expect(
      configure({ requestLocale: Promise.resolve("en-US") })
    ).rejects.toThrow("Missing root layout");
  });
});

describe("request middleware locale", () => {
  it("reads the locale actually produced by next-intl for a localized action", () => {
    const response = i18nProxy(
      new NextRequest("https://example.test/fr-FR", { method: "POST" })
    );
    const forwarded = new Headers();
    for (const name of response.headers
      .get("x-middleware-override-headers")
      ?.split(",") ?? []) {
      const value = response.headers.get(`x-middleware-request-${name}`);
      if (value !== null) {
        forwarded.set(name, value);
      }
    }
    expect(localeFromHeaders(forwarded)).toBe("fr-FR");
  });

  it.each([undefined, "invalid"])(
    "uses the configured default for an absent or invalid locale: %s",
    (locale) => {
      const headers = new Headers();
      if (locale !== undefined) {
        headers.set("X-NEXT-INTL-LOCALE", locale);
      }
      expect(localeFromHeaders(headers)).toBe(routing.defaultLocale);
    }
  );
});
