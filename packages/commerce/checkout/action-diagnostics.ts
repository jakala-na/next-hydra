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
  switch (error._tag) {
    case "CheckoutMutationProviderFailure":
    case "CheckoutMutationUnsupported":
      return Effect.logError(error.message, error).pipe(
        Effect.annotateLogs({
          "checkout.error.tag": error._tag,
          "checkout.operation": error.operation,
        })
      );
    default:
      return Effect.void;
  }
};
