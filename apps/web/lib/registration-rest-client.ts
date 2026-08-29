import "server-only";
import { RegistrationHttpApi } from "@repo/registration/http/registration-api";
import { Context, Effect, Layer } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import {
  classifyRegistrationResponse,
  exposeRegistrationResponseError,
} from "./registration-http-response-error";

const TRAILING_SLASH_PATTERN = /\/$/u;

const resolveApiBaseUrl = (baseUrl?: string) => {
  if (baseUrl !== undefined) {
    return Effect.succeed(baseUrl.replace(TRAILING_SLASH_PATTERN, ""));
  }

  return Effect.promise(async () => {
    const { env } = await import("@/env");
    return env.NEXT_PUBLIC_API_URL.replace(TRAILING_SLASH_PATTERN, "");
  });
};

export const makeRegistrationRestClient = Effect.fn(
  "RegistrationRestClient.make"
)(function* makeRegistrationRestClientEffect(
  accessToken?: string,
  baseUrl?: string
) {
  const resolvedBaseUrl = yield* resolveApiBaseUrl(baseUrl);

  return yield* HttpApiClient.make(RegistrationHttpApi, {
    baseUrl: resolvedBaseUrl,
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
  );
});

export type RegistrationHttpApiClient = Effect.Success<
  ReturnType<typeof makeRegistrationRestClient>
>;

export class RegistrationClient extends Context.Service<
  RegistrationClient,
  RegistrationHttpApiClient
>()("@repo/web/RegistrationClient") {}

export const registrationClientLayer = (
  accessToken?: string,
  baseUrl?: string
): Layer.Layer<RegistrationClient> =>
  Layer.effect(
    RegistrationClient,
    makeRegistrationRestClient(accessToken, baseUrl)
  );

export { RegistrationHttpResponseError } from "./registration-http-response-error";
