import "server-only";
import { RegistrationHttpApi } from "@repo/registration/http/registration-api";
import { Data, Effect, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import { env } from "@/env";

const TRAILING_SLASH_PATTERN = /\/$/u;

const apiBaseUrl = (env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002").replace(
  TRAILING_SLASH_PATTERN,
  ""
);

export class RegistrationHttpResponseError extends Data.TaggedError(
  "RegistrationHttpResponseError"
)<{
  readonly cause: Schema.SchemaError | HttpClientError.HttpClientError;
}> {}

const classifyRegistrationResponse = <A, E, R>(
  response: Effect.Effect<A, E, R>
): Effect.Effect<A, E | RegistrationHttpResponseError, R> =>
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This transforms an Effect failure channel, not Promise control flow.
  Effect.mapError(response, (error) =>
    Schema.isSchemaError(error) || HttpClientError.isHttpClientError(error)
      ? new RegistrationHttpResponseError({ cause: error })
      : error
  );

const exposeRegistrationResponseError = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | RegistrationHttpResponseError, R> => effect;

export const makeRegistrationRestClient = Effect.fn(
  "RegistrationRestClient.make"
)((accessToken?: string) =>
  HttpApiClient.make(RegistrationHttpApi, {
    baseUrl: apiBaseUrl,
    transformClient: HttpClient.mapRequest((request) => {
      const acceptedRequest = HttpClientRequest.acceptJson(request);

      return accessToken === undefined
        ? acceptedRequest
        : HttpClientRequest.bearerToken(acceptedRequest, accessToken);
    }),
    transformResponse: classifyRegistrationResponse,
  }).pipe(
    Effect.map((client) => ({
      registrations: {
        approve: (
          request: Parameters<typeof client.registrations.approve>[number]
        ) =>
          exposeRegistrationResponseError(
            client.registrations.approve(request)
          ),
        create: (
          request: Parameters<typeof client.registrations.create>[number]
        ) =>
          exposeRegistrationResponseError(client.registrations.create(request)),
        get: (request: Parameters<typeof client.registrations.get>[number]) =>
          exposeRegistrationResponseError(client.registrations.get(request)),
        list: (request: Parameters<typeof client.registrations.list>[number]) =>
          exposeRegistrationResponseError(client.registrations.list(request)),
        reject: (
          request: Parameters<typeof client.registrations.reject>[number]
        ) =>
          exposeRegistrationResponseError(client.registrations.reject(request)),
      },
    })),
    Effect.provide(FetchHttpClient.layer)
  )
);
