import { Data, Effect, Schema } from "effect";
import { HttpClientError } from "effect/unstable/http";

export class RegistrationHttpResponseError extends Data.TaggedError(
  "RegistrationHttpResponseError"
)<{
  readonly cause: Schema.SchemaError | HttpClientError.HttpClientError;
}> {}

export const classifyRegistrationResponse = <A, E, R>(
  response: Effect.Effect<A, E, R>
): Effect.Effect<A, E | RegistrationHttpResponseError, R> =>
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This transforms an Effect failure channel, not Promise control flow.
  Effect.mapError(response, (error) =>
    Schema.isSchemaError(error) || HttpClientError.isHttpClientError(error)
      ? new RegistrationHttpResponseError({ cause: error })
      : error
  );

export const exposeRegistrationResponseError = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | RegistrationHttpResponseError, R> => effect;
