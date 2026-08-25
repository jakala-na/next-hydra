import "server-only";
import { createApiBuilderFromCtpClient } from "@commercetools/platform-sdk";
import { ClientBuilder } from "@commercetools/ts-client";
import type {
  AuthMiddlewareOptions,
  HttpMiddlewareOptions,
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
      credentials: {
        clientId: config.clientId,
        clientSecret: Redacted.value(config.clientSecret),
      },
      host: `https://auth.${config.region}.commercetools.com`,
      httpClient: fetch,
      projectKey: config.projectKey,
      scopes: config.scope.split(" "),
    };
    const httpMiddlewareOptions: HttpMiddlewareOptions = {
      enableRetry: true,
      host: `https://api.${config.region}.commercetools.com`,
      httpClient: fetch,
      retryConfig: {
        backoff: false,
        maxRetries: 3,
        retryCodes: [
          INTERNAL_SERVER_ERROR_STATUS_CODE,
          SERVICE_UNAVAILABLE_STATUS_CODE,
        ],
        retryDelay: 200,
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
