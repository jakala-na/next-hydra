import type {
  ClientResponse,
  GraphQLResponse,
  GraphQLVariablesMap,
} from "@commercetools/platform-sdk";
import type { HttpErrorType } from "@commercetools/ts-client";
import {
  type Exchange,
  makeErrorResult,
  makeResult,
  type Operation,
  type OperationResult,
} from "@urql/core";
import { filter, fromPromise, merge, mergeMap, pipe, takeUntil } from "wonka";
import { apiRoot } from "./api-root";

type GraphQLErrorLike = {
  message: string;
  [key: string]: unknown;
};

/** Execute a GraphQL request using the commercetools SDK */
async function executeCommercetoolsRequest(
  operation: Operation,
  requestBody: { query: string; variables?: GraphQLVariablesMap }
): Promise<OperationResult> {
  let response: ClientResponse<GraphQLResponse> | undefined;
  try {
    response = await apiRoot
      .graphql()
      .post({
        body: requestBody,
      })
      .execute();

    // biome-ignore lint/suspicious/noExplicitAny: commercetools SDK response is not strictly typed
    const body = response.body as any;

    return makeResult(
      operation,
      {
        data: body?.data ?? null,
        errors: body?.errors as GraphQLErrorLike[] | undefined,
      },
      response
    );
  } catch (error) {
    const httpError = error as HttpErrorType;
    return makeErrorResult(operation, new Error(httpError?.message), response);
  }
}

/** CommerceTools GraphQL exchange using the commercetools SDK.
 *
 * @remarks
 * This exchange delegates all HTTP transport to the commercetools SDK,
 * leveraging its built-in authentication, retry logic, and middleware.
 * It follows the pattern of urql's fetchExchange but uses the commercetools
 * client instead of the Fetch API.
 */
export const ctExchange: Exchange = ({ forward }) => {
  return (ops$) => {
    const fetchResults$ = pipe(
      ops$,
      filter(
        (operation) =>
          operation.kind !== "teardown" &&
          (operation.kind !== "subscription" ||
            !!operation.context.fetchSubscriptions)
      ),
      mergeMap((operation) => {
        // Extract query string - urql compiles queries, handle both cases
        const query =
          operation.query.loc?.source.body ?? String(operation.query);

        const requestBody = {
          query,
          variables: operation.variables || undefined,
        };

        const source = pipe(
          fromPromise(executeCommercetoolsRequest(operation, requestBody)),
          takeUntil(
            pipe(
              ops$,
              filter((op) => op.kind === "teardown" && op.key === operation.key)
            )
          )
        );

        return source;
      })
    );

    const forward$ = pipe(
      ops$,
      filter(
        (operation) =>
          operation.kind === "teardown" ||
          (operation.kind === "subscription" &&
            !operation.context.fetchSubscriptions)
      ),
      forward
    );

    return merge([fetchResults$, forward$]);
  };
};
