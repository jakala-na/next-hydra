/* oxlint-disable promise/prefer-await-to-callbacks -- Effect combinators transform Effect values, not Promises. */
import { Effect, Filter } from "effect";

import type { CurrentCartReadFailure } from "../services/current-cart";
import { CART_UNAVAILABLE } from "./public-state";

/**
 * Shared Cart chrome represents a provider outage explicitly. Every other
 * typed failure, and every defect, remains observable.
 */
export const projectCurrentCartProviderOutage = <A, R>(
  program: Effect.Effect<A, CurrentCartReadFailure, R>
) =>
  program.pipe(
    Effect.catchFilter(Filter.tagged("CartProviderFailure"), (failure) => {
      if (failure.reason !== "unavailable") {
        return Effect.fail(failure);
      }
      return Effect.logError("Failed to read Current Cart", failure).pipe(
        Effect.annotateLogs({ operation: "currentCart.get" }),
        Effect.as(CART_UNAVAILABLE)
      );
    })
  );
