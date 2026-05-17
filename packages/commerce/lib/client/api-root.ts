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
import { log } from "@repo/observability/log";
import { createGraphqlConcurrentModificationMiddleware } from "./graphql-concurrent-modification-middleware";

// --- Configuration from Environment Variables ---
const projectKey = keys().COMMERCETOOLS_PROJECT_KEY;
const clientId = keys().COMMERCETOOLS_CLIENT_ID;
const clientSecret = keys().COMMERCETOOLS_CLIENT_SECRET;
const authHost = `https://auth.${keys().COMMERCETOOLS_REGION}.commercetools.com`;
const apiHost = `https://api.${keys().COMMERCETOOLS_REGION}.commercetools.com`;

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
    retryCodes: [500, 503],
  },
};

// --- Create the commercetools Client ---
const ctpClient = new ClientBuilder()
  .withProjectKey(projectKey)
  .withClientCredentialsFlow(authMiddlewareOptions)
  .withHttpMiddleware(httpMiddlewareOptions)
  .withConcurrentModificationMiddleware({
    concurrentModificationHandlerFn: (version, request) => {
      log.info(
        `REST concurrent modification error, retry with version ${version}`
      );

      // biome-ignore lint/suspicious/noExplicitAny: request body can be various types
      const body = request.body as Record<string, any>;
      body.version = version;

      return Promise.resolve(body);
    },
  })
  .withMiddleware(createGraphqlConcurrentModificationMiddleware())
  // .withLoggerMiddleware() // TODO: Uncomment this when we have a logger
  .build();

const ctpClientWithoutConcurrentModificationRetry = new ClientBuilder()
  .withProjectKey(projectKey)
  .withClientCredentialsFlow(authMiddlewareOptions)
  .withHttpMiddleware(httpMiddlewareOptions)
  .build();

// --- Create the API Root ---
export const apiRoot = createApiBuilderFromCtpClient(ctpClient).withProjectKey({
  projectKey,
});

// Temporary escape hatch for state-machine writes where a concurrent modification
// is a meaningful conflict, not a retryable transport detail. Revisit the shared
// apiRoot retry policy later and prefer explicit per-action retry composition.
export const apiRootWithoutConcurrentModificationRetry =
  createApiBuilderFromCtpClient(
    ctpClientWithoutConcurrentModificationRetry
  ).withProjectKey({
    projectKey,
  });
