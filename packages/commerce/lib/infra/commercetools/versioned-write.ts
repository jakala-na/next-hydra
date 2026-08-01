import { Effect, Option, Schema } from "effect";

const CONCURRENT_MODIFICATION_STATUS_CODE = 409;

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
  statusCode: Schema.optional(Schema.Number),
  code: Schema.optional(Schema.String),
  currentVersion: Schema.optional(Schema.Number),
  extensions: Schema.optional(CommercetoolsErrorDetail),
  body: Schema.optional(Schema.Unknown),
  graphQLErrors: Schema.optional(Schema.Array(CommercetoolsErrorDetail)),
  cause: Schema.optional(Schema.Unknown),
});

type CommercetoolsErrorEnvelope = typeof CommercetoolsErrorEnvelope.Type;
type CommercetoolsErrorDetail = typeof CommercetoolsErrorDetail.Type;

export class CommercetoolsRequestFailure extends Schema.TaggedErrorClass<CommercetoolsRequestFailure>()(
  "CommercetoolsRequestFailure",
  {
    message: Schema.String,
    cause: Schema.Defect,
  }
) {}

export class CommercetoolsConcurrentModification extends Schema.TaggedErrorClass<CommercetoolsConcurrentModification>()(
  "CommercetoolsConcurrentModification",
  {
    currentVersion: Schema.Number,
    cause: Schema.Defect,
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
    envelope.statusCode === CONCURRENT_MODIFICATION_STATUS_CODE ||
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
          currentVersion: decoded.currentVersion,
          cause: decoded.cause,
        })
      );
};

export const commercetoolsRequest = <Value>(
  message: string,
  request: () => PromiseLike<Value>
): Effect.Effect<Value, CommercetoolsRequestFailure> =>
  Effect.tryPromise({
    try: request,
    catch: (cause) => new CommercetoolsRequestFailure({ message, cause }),
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
  readonly operation: string;
  readonly input: Input;
  readonly attempt: (
    input: Input
  ) => Effect.Effect<Value, AttemptError, AttemptRequirements>;
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
      case "PreserveConflict":
        return yield* Effect.fail(firstAttempt.failure);
      case "Retry":
        yield* Effect.logInfo(
          `Retrying Commercetools versioned write ${operation} after provider reported version ${String(conflict.value.currentVersion)}`
        );
        return yield* attempt(resolution.input);
      default:
        return resolution satisfies never;
    }
  });
