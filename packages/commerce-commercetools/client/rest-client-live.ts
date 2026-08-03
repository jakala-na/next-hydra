import "server-only";

import { createApiBuilderFromCtpClient } from "@commercetools/platform-sdk";
import {
  type AuthMiddlewareOptions,
  ClientBuilder,
  type HttpMiddlewareOptions,
} from "@commercetools/ts-client";
import { Effect, Layer, Redacted } from "effect";
import { CommercetoolsConfig } from "../config/config";
import { CommercetoolsRestClient } from "./rest-client";

const INTERNAL_SERVER_ERROR_STATUS_CODE = 500;
const SERVICE_UNAVAILABLE_STATUS_CODE = 503;

export const restClientLayer = Layer.effect(
  CommercetoolsRestClient,
  Effect.gen(function* () {
    const config = yield* CommercetoolsConfig;
    const authMiddlewareOptions: AuthMiddlewareOptions = {
      host: `https://auth.${config.region}.commercetools.com`,
      projectKey: config.projectKey,
      credentials: {
        clientId: config.clientId,
        clientSecret: Redacted.value(config.clientSecret),
      },
      scopes: config.scope.split(" "),
      httpClient: fetch,
    };
    const httpMiddlewareOptions: HttpMiddlewareOptions = {
      host: `https://api.${config.region}.commercetools.com`,
      httpClient: fetch,
      enableRetry: true,
      retryConfig: {
        maxRetries: 3,
        retryDelay: 200,
        backoff: false,
        retryCodes: [
          INTERNAL_SERVER_ERROR_STATUS_CODE,
          SERVICE_UNAVAILABLE_STATUS_CODE,
        ],
      },
    };
    const client = new ClientBuilder()
      .withProjectKey(config.projectKey)
      .withClientCredentialsFlow(authMiddlewareOptions)
      .withHttpMiddleware(httpMiddlewareOptions)
      .build();

    return CommercetoolsRestClient.of({
      apiRoot: createApiBuilderFromCtpClient(client).withProjectKey({
        projectKey: config.projectKey,
      }),
    });
  })
);
