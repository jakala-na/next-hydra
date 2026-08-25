import "server-only";
import { getLocale } from "@repo/i18n";
import { Effect, Layer } from "effect";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { NextRequestApi } from "./next-request-api";

export type { NextCookieStore } from "./next-request-api";
export { NextRequestApi } from "./next-request-api";

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
