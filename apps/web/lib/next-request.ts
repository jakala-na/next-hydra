import "server-only";
import { getLocale } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import { Context, Effect, Layer } from "effect";
import { cookies } from "next/headers";
import { connection } from "next/server";

export type NextCookieStore = Awaited<ReturnType<typeof cookies>>;

export class NextRequestApi extends Context.Service<
  NextRequestApi,
  {
    readonly connect: () => Effect.Effect<void>;
    readonly getCookies: () => Effect.Effect<NextCookieStore>;
    readonly getLocale: () => Effect.Effect<Locale>;
  }
>()("@repo/web/NextRequestApi") {}

export const nextRequestApiLayer = Layer.succeed(NextRequestApi, {
  connect: Effect.fn("NextRequestApi.connect")(() =>
    Effect.promise(connection)
  ),
  getCookies: Effect.fn("NextRequestApi.getCookies")(() =>
    Effect.promise(cookies)
  ),
  getLocale: Effect.fn("NextRequestApi.getLocale")(() =>
    Effect.promise(getLocale)
  ),
});
