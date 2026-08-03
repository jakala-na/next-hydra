import type {
  ByProjectKeyRequestBuilder,
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

type GraphQLErrorLike = {
  message: string;
  [key: string]: unknown;
};

const executeCommercetoolsRequest = async (
  apiRoot: ByProjectKeyRequestBuilder,
  operation: Operation,
  requestBody: { query: string; variables?: GraphQLVariablesMap }
): Promise<OperationResult> => {
  let response: ClientResponse<GraphQLResponse> | undefined;
  try {
    response = await apiRoot.graphql().post({ body: requestBody }).execute();

    // biome-ignore lint/suspicious/noExplicitAny: Commercetools leaves GraphQL response data untyped.
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
};

export const makeCommercetoolsGraphqlExchange =
  (apiRoot: ByProjectKeyRequestBuilder): Exchange =>
  ({ forward }) =>
  (operations) => {
    const requestResults = pipe(
      operations,
      filter(
        (operation) =>
          operation.kind !== "teardown" &&
          (operation.kind !== "subscription" ||
            Boolean(operation.context.fetchSubscriptions))
      ),
      mergeMap((operation) => {
        const query =
          operation.query.loc?.source.body ?? String(operation.query);
        const result = pipe(
          fromPromise(
            executeCommercetoolsRequest(apiRoot, operation, {
              query,
              variables: operation.variables || undefined,
            })
          ),
          takeUntil(
            pipe(
              operations,
              filter(
                (candidate) =>
                  candidate.kind === "teardown" &&
                  candidate.key === operation.key
              )
            )
          )
        );

        return result;
      })
    );
    const forwardedResults = pipe(
      operations,
      filter(
        (operation) =>
          operation.kind === "teardown" ||
          (operation.kind === "subscription" &&
            !operation.context.fetchSubscriptions)
      ),
      forward
    );

    return merge([requestResults, forwardedResults]);
  };
