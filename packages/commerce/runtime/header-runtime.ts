import { NextCommerce } from "@repo/commerce/runtime";
import type { Locale } from "@repo/i18n/types";
import type { Effect } from "effect";

import type { CommerceAccounts } from "../services/commerce-accounts";
import type { CommerceContext } from "../services/commerce-context";
import type { CurrentCart } from "../services/current-cart";

export type HeaderCommerceServices =
  | CommerceAccounts
  | CommerceContext
  | CurrentCart;

/** Header reads do not need checkout, registration, or payment services. */
export interface HeaderCommerceRuntimeBinding {
  readonly run: <A, E>(
    locale: Locale,
    program: Effect.Effect<A, E, HeaderCommerceServices>
  ) => Promise<A>;
}

/** The reference storefront supplies these services through its full runtime. */
export const HeaderCommerceRuntime: HeaderCommerceRuntimeBinding = {
  run: async (locale, program) =>
    await NextCommerce.runPromise(program.pipe(NextCommerce.provide(locale))),
};
