import { Effect } from "effect";

import type {
  CheckoutSaveContactFailure,
  CheckoutSaveDeliveryDetailsFailure,
} from "../lib/checkout/checkout-session";

type CheckoutMutationFailure =
  | CheckoutSaveContactFailure
  | CheckoutSaveDeliveryDetailsFailure;

export const logUnexpectedCheckoutMutationFailure = (
  error: CheckoutMutationFailure
) => {
  if (error._tag === "CheckoutMutationProviderFailure") {
    return Effect.logError(error.message, error.cause ?? error).pipe(
      Effect.annotateLogs({
        "checkout.error.tag": error._tag,
        "checkout.operation": error.operation,
      })
    );
  }

  return error._tag === "CheckoutMutationUnsupported"
    ? Effect.logError(error.message, error).pipe(
        Effect.annotateLogs({
          "checkout.error.tag": error._tag,
          "checkout.operation": error.operation,
        })
      )
    : Effect.void;
};
