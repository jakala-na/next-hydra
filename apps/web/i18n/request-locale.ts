import { hasLocale } from "@repo/i18n";
import type sharedRequestConfig from "@repo/i18n/request";
import { routing } from "@repo/i18n/routing";

type RequestConfig = typeof sharedRequestConfig;

/** next-intl middleware supplies this header on the rewritten request, including actions. */
export function localeFromHeaders(headers: Pick<Headers, "get">) {
  const requested = headers.get("X-NEXT-INTL-LOCALE");
  return hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;
}

/** Explicit locales work in actions and handlers, where root params are unavailable. */
export function withRootLocale(
  configure: RequestConfig,
  readRootLocale: () => Promise<string | undefined>
): RequestConfig {
  return async (params) => {
    const locale = params.locale ?? (await readRootLocale());
    // Do not spread params: requestLocale is a lazy getter that reads headers.
    return await configure({
      locale: params.locale,
      requestLocale: Promise.resolve(locale),
    });
  };
}
