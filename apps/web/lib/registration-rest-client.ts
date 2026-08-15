import "server-only";
import { RegistrationHttpApi } from "@repo/registration/http/registration-api";
import { Effect } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import { env } from "@/env";

const TRAILING_SLASH_PATTERN = /\/$/;

const apiBaseUrl = (env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002").replace(
  TRAILING_SLASH_PATTERN,
  ""
);

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
  }).pipe(Effect.provide(FetchHttpClient.layer))
);
