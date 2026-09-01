/* oxlint-disable promise/prefer-await-to-callbacks -- Effect combinators transform Effect values, not Promises. */
import { Effect, Filter } from "effect";

import type {
  CheckoutMutationProviderFailure,
  CheckoutPaymentOptionsUnavailable,
  CheckoutProviderFailure,
  CheckoutMutationFailure,
  CheckoutMutationUnsupported,
  CheckoutUnavailable,
} from "../../domain/checkout";

type CheckoutDiagnosticFailure =
  | CheckoutMutationProviderFailure
  | CheckoutMutationUnsupported
  | CheckoutProviderFailure;
type CheckoutSessionMutationFailure =
  | CheckoutMutationFailure
  | CheckoutUnavailable;
type CheckoutSessionReadFailure =
  | CheckoutPaymentOptionsUnavailable
  | CheckoutProviderFailure
  | CheckoutUnavailable;

const logCheckoutDiagnosticFailure = (error: CheckoutDiagnosticFailure) =>
  Effect.logError(
    error.message,
    "cause" in error ? (error.cause ?? error) : error
  ).pipe(
    Effect.annotateLogs({
      "checkout.error.tag": error._tag,
      "checkout.operation": error.operation,
    })
  );

const defectCheckoutFailure = (error: CheckoutDiagnosticFailure) =>
  logCheckoutDiagnosticFailure(error).pipe(Effect.andThen(Effect.die(error)));

/** Keeps only explicitly classified provider outages in the expected channel. */
export const retainRecoverableCheckoutProviderFailure = (
  error: CheckoutMutationProviderFailure
) =>
  error.reason === "unavailable"
    ? Effect.fail(error)
    : defectCheckoutFailure(error);

export const retainExpectedCheckoutMutationFailures = <
  A,
  E extends CheckoutSessionMutationFailure,
  R,
>(
  program: Effect.Effect<A, E, R>
) => {
  const withoutUnsupportedFailure = program.pipe(
    Effect.catchFilter(
      Filter.tagged("CheckoutMutationUnsupported"),
      defectCheckoutFailure
    )
  );

  return withoutUnsupportedFailure.pipe(
    Effect.catchFilter(
      Filter.tagged("CheckoutMutationProviderFailure"),
      retainRecoverableCheckoutProviderFailure
    ),
    Effect.tapError((error) =>
      error._tag === "CheckoutMutationProviderFailure"
        ? logCheckoutDiagnosticFailure(error)
        : Effect.void
    )
  );
};

export const retainExpectedCheckoutReadFailures = <
  A,
  E extends CheckoutSessionReadFailure,
  R,
>(
  program: Effect.Effect<A, E, R>
) =>
  program.pipe(
    Effect.catchFilter(Filter.tagged("CheckoutProviderFailure"), (error) =>
      error.reason === "unavailable"
        ? Effect.fail(error)
        : defectCheckoutFailure(error)
    ),
    Effect.tapError((error) =>
      error._tag === "CheckoutProviderFailure"
        ? logCheckoutDiagnosticFailure(error)
        : Effect.void
    )
  );
