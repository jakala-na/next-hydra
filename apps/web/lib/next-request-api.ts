import type { Locale } from "@repo/i18n/types";
import type { Effect } from "effect";
import { Context } from "effect";

export type NextCookieSetOptions = {
  readonly httpOnly?: boolean;
  readonly maxAge?: number;
  readonly path?: string;
  readonly sameSite?: "lax" | "none" | "strict";
  readonly secure?: boolean;
};

/** Structural cookie store used by request Layers; host binds the Next implementation. */
export type NextCookieStore = {
  readonly delete: (name: string) => void;
  readonly get: (name: string) => { readonly value: string } | undefined;
  readonly set: (
    name: string,
    value: string,
    options?: NextCookieSetOptions
  ) => void;
};

export class NextRequestApi extends Context.Service<
  NextRequestApi,
  {
    readonly connect: () => Effect.Effect<void>;
    readonly getCookies: () => Effect.Effect<NextCookieStore>;
    readonly getLocale: () => Effect.Effect<Locale>;
  }
>()("@repo/web/NextRequestApi") {}
