import type {
  Middleware,
  MiddlewareRequest,
  MiddlewareResponse,
  Next,
} from "@commercetools/ts-client";
import { log } from "@repo/observability/log";

/**
 * Type for the modifier function that updates the request body with the new version
 */
type ModifierFunction = (
  version: number,
  request: MiddlewareRequest,
  response: MiddlewareResponse
  // biome-ignore lint/suspicious/noExplicitAny: middleware can return various body types
) => Promise<Record<string, any> | string | Uint8Array>;

/**
 * GraphQL error structure from commercetools
 */
type GraphQLError = {
  message: string;
  extensions?: {
    code?: string;
    currentVersion?: number;
    // biome-ignore lint/suspicious/noExplicitAny: extensions can contain arbitrary metadata
    [key: string]: any;
  };
};

/**
 * GraphQL response body structure
 */
type GraphQLResponseBody = {
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL data can be of any shape
  data?: any;
  errors?: GraphQLError[];
};

/**
 * Checks if a GraphQL error is a concurrent modification error
 */
function isConcurrentModificationError(error: GraphQLError): boolean {
  return error.extensions?.code === "ConcurrentModification";
}

/**
 * Updates the request body with the new version
 */
function updateRequestBodyWithVersion(
  request: MiddlewareRequest,
  currentVersion: number
): void {
  const body =
    typeof request.body === "string" ? JSON.parse(request.body) : request.body;

  // GraphQL requests have a variables object that may contain the version
  if (!(body && typeof body === "object" && "variables" in body)) {
    return;
  }

  // biome-ignore lint/suspicious/noExplicitAny: variables can contain any fields
  const variables = body.variables as Record<string, any>;

  // Bump the version. This will be used to retry the request.
  variables.version = currentVersion;

  request.body = body;
}

/**
 * Handles concurrent modification error if found in the response
 */
async function handleConcurrentModificationError(
  response: MiddlewareResponse,
  request: MiddlewareRequest,
  next: Next,
  modifierFunction?: ModifierFunction
): Promise<MiddlewareResponse | null> {
  const responseBody = response.body as GraphQLResponseBody;

  if (!responseBody?.errors) {
    return null;
  }

  // Look for concurrent modification error in the errors array
  const concurrentModificationError = responseBody.errors.find(
    isConcurrentModificationError
  );

  if (!concurrentModificationError?.extensions?.currentVersion) {
    return null;
  }

  const currentVersion = concurrentModificationError.extensions.currentVersion;

  log.info(
    `GraphQL concurrent modification detected, retrying with version ${currentVersion}`
  );

  // Update the request body with the new version
  if (typeof modifierFunction === "function") {
    request.body = await modifierFunction(currentVersion, request, response);
  } else {
    updateRequestBodyWithVersion(request, currentVersion);
  }

  // Retry the request with the updated version
  return next(request);
}

/**
 * Creates a middleware to handle concurrent modification errors in GraphQL requests
 *
 * When a GraphQL mutation results in a concurrent modification error (version mismatch),
 * this middleware automatically extracts the current version from the error extensions
 * and retries the request with the updated version.
 *
 * @param modifierFunction - Optional custom function to modify the request body with the new version.
 *                          If not provided, the default behavior is to update the variables.version field.
 * @returns A middleware that handles GraphQL concurrent modification errors
 *
 * @example
 * ```typescript
 * const client = new ClientBuilder()
 *   .withMiddleware(createGraphqlConcurrentModificationMiddleware())
 *   .build();
 * ```
 */
export function createGraphqlConcurrentModificationMiddleware(
  modifierFunction?: ModifierFunction
): Middleware {
  return (next: Next) => {
    return async (request: MiddlewareRequest): Promise<MiddlewareResponse> => {
      const response = await next(request);

      // Check if this is a GraphQL request
      const isGraphQLRequest =
        request.uri?.includes("/graphql") || request.uri?.endsWith("/graphql");

      if (!isGraphQLRequest) {
        return response;
      }

      // For GraphQL, we need to check the response body for errors
      // GraphQL errors come with status 200, so we can't rely on statusCode alone
      try {
        const retryResponse = await handleConcurrentModificationError(
          response,
          request,
          next,
          modifierFunction
        );

        return retryResponse ?? response;
      } catch (error) {
        // If we can't parse the response or something goes wrong,
        // just return the original response
        log.error("Error in GraphQL concurrent modification middleware", {
          error: error instanceof Error ? error.message : String(error),
        });
        return response;
      }
    };
  };
}
