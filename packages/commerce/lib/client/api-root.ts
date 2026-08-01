/**
 * This file is a server-only file, meaning it should not be included in the client bundle.
 * @see https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment
 */

import "server-only";

import { createApiBuilderFromCtpClient } from "@commercetools/platform-sdk";
import {
  type AuthMiddlewareOptions,
  ClientBuilder,
  type HttpMiddlewareOptions,
} from "@commercetools/ts-client";
import { keys } from "@repo/commerce/keys";

// --- Configuration from Environment Variables ---
const projectKey = keys().COMMERCETOOLS_PROJECT_KEY;
const clientId = keys().COMMERCETOOLS_CLIENT_ID;
const clientSecret = keys().COMMERCETOOLS_CLIENT_SECRET;
const authHost = `https://auth.${keys().COMMERCETOOLS_REGION}.commercetools.com`;
const apiHost = `https://api.${keys().COMMERCETOOLS_REGION}.commercetools.com`;
const INTERNAL_SERVER_ERROR_STATUS_CODE = 500;
const SERVICE_UNAVAILABLE_STATUS_CODE = 503;

// Define the necessary OAuth 2.0 scopes for GraphQL queries.
const scopes = keys().COMMERCETOOLS_SCOPE.split(" ");

// --- Configure Auth Middleware Options ---
const authMiddlewareOptions: AuthMiddlewareOptions = {
  host: authHost,
  projectKey,
  credentials: {
    clientId,
    clientSecret,
  },
  scopes,
  httpClient: fetch,
};

// --- Configure HTTP Middleware Options ---
const httpMiddlewareOptions: HttpMiddlewareOptions = {
  host: apiHost,
  httpClient: fetch,
  // Optional: Add retry configuration for robustness
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

// --- Create the commercetools Client ---
const ctpClient = new ClientBuilder()
  .withProjectKey(projectKey)
  .withClientCredentialsFlow(authMiddlewareOptions)
  .withHttpMiddleware(httpMiddlewareOptions)
  // .withLoggerMiddleware() // TODO: Uncomment this when we have a logger
  .build();

// --- Create the API Root ---
export const apiRoot = createApiBuilderFromCtpClient(ctpClient).withProjectKey({
  projectKey,
});
