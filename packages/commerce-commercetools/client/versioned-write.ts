import type { ProviderFailureReason } from "@repo/commerce/domain/provider-failure";
import { hasTransientTransportCode } from "@repo/errors/transport";
import { Effect, Option, Schema } from "effect";

const HTTP_CONCURRENT_MODIFICATION_STATUS_CODE = 409;
const HTTP_CLIENT_ERROR_MIN_STATUS_CODE = 400;
const HTTP_CLIENT_ERROR_MAX_STATUS_CODE = 500;
const HTTP_FORBIDDEN_STATUS_CODE = 403;
const HTTP_RATE_LIMITED_STATUS_CODE = 429;
const HTTP_REQUEST_TIMEOUT_STATUS_CODE = 408;
const HTTP_SERVER_ERROR_MIN_STATUS_CODE = 500;
const HTTP_UNAUTHORIZED_STATUS_CODE = 401;

const CommercetoolsErrorDetail = Schema.Struct({
  code: Schema.optional(Schema.String),
  currentVersion: Schema.optional(Schema.Number),
  extensions: Schema.optional(
    Schema.Struct({
      code: Schema.optional(Schema.String),
      currentVersion: Schema.optional(Schema.Number),
    })
  ),
});

const CommercetoolsErrorBody = Schema.Struct({
  code: Schema.optional(Schema.String),
  currentVersion: Schema.optional(Schema.Number),
  errors: Schema.optional(Schema.Array(CommercetoolsErrorDetail)),
});

const CommercetoolsErrorEnvelope = Schema.Struct({
  body: Schema.optional(Schema.Unknown),
  cause: Schema.optional(Schema.Unknown),
  code: Schema.optional(Schema.String),
  currentVersion: Schema.optional(Schema.Number),
  extensions: Schema.optional(CommercetoolsErrorDetail),
  graphQLErrors: Schema.optional(Schema.Array(CommercetoolsErrorDetail)),
  statusCode: Schema.optional(Schema.Number),
});

type CommercetoolsErrorEnvelope = typeof CommercetoolsErrorEnvelope.Type;
type CommercetoolsErrorDetail = typeof CommercetoolsErrorDetail.Type;

export class CommercetoolsRequestFailure extends Schema.TaggedError<CommercetoolsRequestFailure>()(
  "CommercetoolsRequestFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
  }
) {}

export class CommercetoolsConcurrentModification extends Schema.TaggedError<CommercetoolsConcurrentModification>()(
  "CommercetoolsConcurrentModification",
  {
    cause: Schema.Defect(),
    currentVersion: Schema.Number,
  }
) {}

export const commercetoolsFailureCause = (error: unknown) =>
  error instanceof CommercetoolsRequestFailure ? error.cause : error;

const decodeEnvelope = (error: unknown) =>
  Option.getOrUndefined(
    Schema.decodeUnknownOption(CommercetoolsErrorEnvelope)(error)
  );

const decodeBody = (body: unknown) => {
  if (typeof body === "string") {
    return Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.fromJsonString(CommercetoolsErrorBody))(
        body
      )
    );
  }

  return Option.getOrUndefined(
    Schema.decodeUnknownOption(CommercetoolsErrorBody)(body)
  );
};

const errorDetails = (
  envelope: CommercetoolsErrorEnvelope
): readonly CommercetoolsErrorDetail[] => {
  const body = decodeBody(envelope.body);

  return [
    envelope,
    ...(envelope.extensions === undefined ? [] : [envelope.extensions]),
    ...(body === undefined ? [] : [body]),
    ...(body?.errors ?? []),
    ...(envelope.graphQLErrors ?? []),
    ...(envelope.graphQLErrors?.flatMap((error) =>
      error.extensions === undefined ? [] : [error.extensions]
    ) ?? []),
  ];
};

export const hasCommercetoolsErrorCode = (
  error: unknown,
  ...codes: readonly string[]
) => {
  const envelope = decodeEnvelope(error);
  return (
    envelope !== undefined &&
    errorDetails(envelope).some(
      (detail) => detail.code !== undefined && codes.includes(detail.code)
    )
  );
};

export const isCommercetoolsAccessDenied = (error: unknown) => {
  const envelope = decodeEnvelope(error);
  return (
    envelope !== undefined &&
    (envelope.statusCode === HTTP_UNAUTHORIZED_STATUS_CODE ||
      envelope.statusCode === HTTP_FORBIDDEN_STATUS_CODE ||
      hasCommercetoolsErrorCode(error, "Forbidden", "Unauthorized"))
  );
};

export const isCommercetoolsClientFailure = (error: unknown) => {
  const envelope = decodeEnvelope(error);
  return (
    envelope?.statusCode !== undefined &&
    envelope.statusCode >= HTTP_CLIENT_ERROR_MIN_STATUS_CODE &&
    envelope.statusCode < HTTP_CLIENT_ERROR_MAX_STATUS_CODE &&
    envelope.statusCode !== HTTP_REQUEST_TIMEOUT_STATUS_CODE &&
    envelope.statusCode !== HTTP_RATE_LIMITED_STATUS_CODE
  );
};

export const isCommercetoolsRateLimited = (error: unknown) =>
  decodeEnvelope(error)?.statusCode === HTTP_RATE_LIMITED_STATUS_CODE;

const isTransientCommercetoolsFailure = (
  error: unknown,
  remainingCauseDepth = 1
): boolean => {
  const cause = commercetoolsFailureCause(error);
  const envelope = decodeEnvelope(cause);
  const statusCode = envelope?.statusCode;

  if (
    statusCode === HTTP_REQUEST_TIMEOUT_STATUS_CODE ||
    statusCode === HTTP_RATE_LIMITED_STATUS_CODE ||
    (statusCode !== undefined &&
      statusCode >= HTTP_SERVER_ERROR_MIN_STATUS_CODE)
  ) {
    return true;
  }

  if (hasTransientTransportCode(cause)) {
    return true;
  }

  return envelope?.cause === undefined || remainingCauseDepth === 0
    ? false
    : isTransientCommercetoolsFailure(envelope.cause, remainingCauseDepth - 1);
};

/**
 * Classifies provider failures at the adapter boundary. Availability requires
 * a positive transient signal; unknown exceptions and contract responses are
 * defect candidates rather than retryable public failures.
 */
export const commercetoolsProviderFailureReason = (
  error: unknown
): ProviderFailureReason =>
  isTransientCommercetoolsFailure(error) ? "unavailable" : "unexpectedResponse";

const decodedConcurrentModification = (
  error: unknown,
  remainingCauseDepth = 1
): {
  readonly cause: unknown;
  readonly currentVersion?: number;
} | null => {
  const envelope = decodeEnvelope(error);

  if (envelope === undefined) {
    return null;
  }

  const details = errorDetails(envelope);
  const isConcurrentModification =
    envelope.statusCode === HTTP_CONCURRENT_MODIFICATION_STATUS_CODE ||
    details.some((detail) => detail.code === "ConcurrentModification");

  if (isConcurrentModification) {
    return {
      cause: error,
      currentVersion: details.find(
        (detail) =>
          detail.currentVersion !== undefined &&
          Number.isSafeInteger(detail.currentVersion) &&
          detail.currentVersion > 0
      )?.currentVersion,
    };
  }

  return remainingCauseDepth > 0 && envelope.cause !== undefined
    ? decodedConcurrentModification(envelope.cause, remainingCauseDepth - 1)
    : null;
};

export const isConcurrentModification = (error: unknown) =>
  decodedConcurrentModification(error) !== null;

export const decodeConcurrentModification = (error: unknown) => {
  const decoded = decodedConcurrentModification(error);

  return decoded?.currentVersion === undefined
    ? Option.none<CommercetoolsConcurrentModification>()
    : Option.some(
        new CommercetoolsConcurrentModification({
          cause: decoded.cause,
          currentVersion: decoded.currentVersion,
        })
      );
};

export const commercetoolsRequest = <Value>(
  message: string,
  request: () => PromiseLike<Value>
): Effect.Effect<Value, CommercetoolsRequestFailure> =>
  Effect.tryPromise({
    catch: (cause) => new CommercetoolsRequestFailure({ cause, message }),
    try: request,
  });

export class RetryVersionedWrite<Input> {
  readonly _tag = "Retry";
  readonly input: Input;

  constructor(input: Input) {
    this.input = input;
  }
}

export class PreserveVersionedWriteConflict {
  readonly _tag = "PreserveConflict";
}

export type VersionedWriteConflictResolution<Input> =
  | RetryVersionedWrite<Input>
  | PreserveVersionedWriteConflict;

export interface RetryVersionedWriteOptions<
  Input,
  Value,
  AttemptError,
  AttemptRequirements,
  ResolutionError,
  ResolutionRequirements,
> {
  readonly attempt: (
    input: Input
  ) => Effect.Effect<Value, AttemptError, AttemptRequirements>;
  readonly input: Input;
  readonly operation: string;
  readonly resolveConflict: (
    conflict: CommercetoolsConcurrentModification,
    input: Input
  ) => Effect.Effect<
    VersionedWriteConflictResolution<Input>,
    ResolutionError,
    ResolutionRequirements
  >;
}

export const retryVersionedWrite = <
  Input,
  Value,
  AttemptError,
  AttemptRequirements,
  ResolutionError,
  ResolutionRequirements,
>({
  operation,
  input,
  attempt,
  resolveConflict,
}: RetryVersionedWriteOptions<
  Input,
  Value,
  AttemptError,
  AttemptRequirements,
  ResolutionError,
  ResolutionRequirements
>): Effect.Effect<
  Value,
  AttemptError | ResolutionError,
  AttemptRequirements | ResolutionRequirements
> =>
  Effect.gen(function* () {
    const firstAttempt = yield* Effect.result(attempt(input));

    if (firstAttempt._tag === "Success") {
      return firstAttempt.success;
    }

    const conflict = decodeConcurrentModification(firstAttempt.failure);

    if (Option.isNone(conflict)) {
      return yield* Effect.fail(firstAttempt.failure);
    }

    const resolution = yield* resolveConflict(conflict.value, input);

    switch (resolution._tag) {
      case "PreserveConflict": {
        return yield* Effect.fail(firstAttempt.failure);
      }
      case "Retry": {
        yield* Effect.logInfo(
          `Retrying Commercetools versioned write ${operation} after provider reported version ${String(conflict.value.currentVersion)}`
        );
        return yield* attempt(resolution.input);
      }
      default: {
        return resolution satisfies never;
      }
    }
  });
