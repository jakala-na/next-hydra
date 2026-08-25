/* oxlint-disable promise/prefer-await-to-callbacks -- Effect combinators transform Effect values, not Promises. */
import { Effect, Filter } from "effect";

import type {
  CartPolicyFailure,
  CartProviderFailure,
  CurrentCartOperationFailure,
} from "../domain/cart-errors";
import type {
  AddCurrentCartItemFailure,
  SetCurrentCartLineItemQuantityFailure,
} from "../services/current-cart";
import type { CartActionOperation } from "./action-result";

type InternalCartFailure =
  | CartPolicyFailure
  | CartProviderFailure
  | CurrentCartOperationFailure;
type CartMutationFailure =
  | AddCurrentCartItemFailure
  | SetCurrentCartLineItemQuantityFailure;

const logCartMutationFailure = (
  operation: CartActionOperation,
  error: unknown
) =>
  Effect.logError("Current Cart mutation failed", error).pipe(
    Effect.annotateLogs({ operation: `currentCart.${operation}` })
  );

const defectCartFailure = (
  operation: CartActionOperation,
  error: InternalCartFailure
) =>
  logCartMutationFailure(operation, error).pipe(
    Effect.andThen(Effect.die(error))
  );

export const retainExpectedCartMutationFailures =
  (operation: CartActionOperation) =>
  <A, E extends CartMutationFailure, R>(program: Effect.Effect<A, E, R>) => {
    const withoutPolicyFailure = program.pipe(
      Effect.catchFilter(Filter.tagged("CartPolicyFailure"), (error) =>
        defectCartFailure(operation, error)
      )
    );

    const withoutCurrentCartOperationFailure = withoutPolicyFailure.pipe(
      Effect.catchFilter(
        Filter.tagged("CurrentCartOperationFailure"),
        (error) => defectCartFailure(operation, error)
      )
    );

    return withoutCurrentCartOperationFailure.pipe(
      Effect.catchFilter(Filter.tagged("CartProviderFailure"), (error) =>
        error.reason === "unavailable"
          ? Effect.fail(error)
          : defectCartFailure(operation, error)
      ),
      Effect.tapError((error) => logCartMutationFailure(operation, error))
    );
  };
