import { NextCommerce } from "@repo/commerce/runtime";
import type { Locale } from "@repo/i18n/types";
import type { Effect } from "effect";

import type { CommerceContext } from "../services/commerce-context";
import type { ProductDiscovery } from "./product-discovery";

/** Product queries need a buying context and discovery, not the checkout runtime. */
export interface CatalogRuntimeBinding {
  readonly run: <A, E>(
    locale: Locale,
    program: Effect.Effect<A, E, CommerceContext | ProductDiscovery>
  ) => Promise<A>;
}

/** The reference storefront reuses its full Commerce runtime. */
export const CatalogRuntime: CatalogRuntimeBinding = {
  run: async (locale, program) =>
    await NextCommerce.runPromise(program.pipe(NextCommerce.provide(locale))),
};
