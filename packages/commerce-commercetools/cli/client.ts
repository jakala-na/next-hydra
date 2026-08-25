import { createApiBuilderFromCtpClient } from "@commercetools/platform-sdk";
import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { ClientBuilder } from "@commercetools/ts-client";
import type {
  AuthMiddlewareOptions,
  HttpMiddlewareOptions,
} from "@commercetools/ts-client";

import type { CommerceCliEnvironment } from "./environment";

const INTERNAL_SERVER_ERROR_STATUS = 500;
const SERVICE_UNAVAILABLE_STATUS = 503;

export const createCommercetoolsClient = (
  environment: CommerceCliEnvironment
): ByProjectKeyRequestBuilder => {
  const authMiddlewareOptions: AuthMiddlewareOptions = {
    credentials: {
      clientId: environment.COMMERCETOOLS_CLIENT_ID,
      clientSecret: environment.COMMERCETOOLS_CLIENT_SECRET,
    },
    host: `https://auth.${environment.COMMERCETOOLS_REGION}.commercetools.com`,
    httpClient: fetch,
    projectKey: environment.COMMERCETOOLS_PROJECT_KEY,
    scopes: environment.COMMERCETOOLS_SCOPE.split(" "),
  };

  const httpMiddlewareOptions: HttpMiddlewareOptions = {
    enableRetry: true,
    host: `https://api.${environment.COMMERCETOOLS_REGION}.commercetools.com`,
    httpClient: fetch,
    retryConfig: {
      backoff: false,
      maxRetries: 3,
      retryCodes: [INTERNAL_SERVER_ERROR_STATUS, SERVICE_UNAVAILABLE_STATUS],
      retryDelay: 200,
    },
  };

  const client = new ClientBuilder()
    .withProjectKey(environment.COMMERCETOOLS_PROJECT_KEY)
    .withClientCredentialsFlow(authMiddlewareOptions)
    .withHttpMiddleware(httpMiddlewareOptions)
    .build();

  return createApiBuilderFromCtpClient(client).withProjectKey({
    projectKey: environment.COMMERCETOOLS_PROJECT_KEY,
  });
};
