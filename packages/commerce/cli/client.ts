import {
  type ByProjectKeyRequestBuilder,
  createApiBuilderFromCtpClient,
} from "@commercetools/platform-sdk";
import {
  type AuthMiddlewareOptions,
  ClientBuilder,
  type HttpMiddlewareOptions,
} from "@commercetools/ts-client";
import type { CommerceCliEnvironment } from "./environment";

const INTERNAL_SERVER_ERROR_STATUS = 500;
const SERVICE_UNAVAILABLE_STATUS = 503;

export const createCommercetoolsClient = (
  environment: CommerceCliEnvironment
): ByProjectKeyRequestBuilder => {
  const authMiddlewareOptions: AuthMiddlewareOptions = {
    host: `https://auth.${environment.COMMERCETOOLS_REGION}.commercetools.com`,
    projectKey: environment.COMMERCETOOLS_PROJECT_KEY,
    credentials: {
      clientId: environment.COMMERCETOOLS_CLIENT_ID,
      clientSecret: environment.COMMERCETOOLS_CLIENT_SECRET,
    },
    scopes: environment.COMMERCETOOLS_SCOPE.split(" "),
    httpClient: fetch,
  };

  const httpMiddlewareOptions: HttpMiddlewareOptions = {
    host: `https://api.${environment.COMMERCETOOLS_REGION}.commercetools.com`,
    httpClient: fetch,
    enableRetry: true,
    retryConfig: {
      maxRetries: 3,
      retryDelay: 200,
      backoff: false,
      retryCodes: [INTERNAL_SERVER_ERROR_STATUS, SERVICE_UNAVAILABLE_STATUS],
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
