import { Schema } from "effect";

/**
 * Provider failure classification used at public capability boundaries.
 * Only `unavailable` is recoverable by retrying the same operation.
 */
export const ProviderFailureReason = Schema.Literals([
  "unavailable",
  "invalidData",
  "unexpectedResponse",
]);
export type ProviderFailureReason = typeof ProviderFailureReason.Type;
