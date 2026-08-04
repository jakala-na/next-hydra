import type {
  ByProjectKeyRequestBuilder,
  ClientResponse,
  GraphQLResponse,
  GraphQLVariablesMap,
} from "@commercetools/platform-sdk";
import {
  type Exchange,
  getOperationName,
  makeErrorResult,
  makeResult,
  type Operation,
  type OperationResult,
} from "@urql/core";
import { Option, Schema } from "effect";
import { filter, fromPromise, merge, mergeMap, pipe, takeUntil } from "wonka";

type GraphQLErrorLike = {
  message: string;
  [key: string]: unknown;
};

const providerGraphqlErrorSchema = Schema.Struct({
  code: Schema.optional(Schema.String),
  extensions: Schema.optional(
    Schema.Struct({ code: Schema.optional(Schema.String) })
  ),
  locations: Schema.optional(
    Schema.Array(
      Schema.Struct({
        column: Schema.Number,
        line: Schema.Number,
      })
    )
  ),
  message: Schema.String,
  path: Schema.optional(
    Schema.Array(Schema.Union([Schema.String, Schema.Number]))
  ),
});

const providerGraphqlErrorPayloadSchema = Schema.Struct({
  errors: Schema.Array(providerGraphqlErrorSchema),
});

const commercetoolsHttpErrorSchema = Schema.Struct({
  body: Schema.optional(Schema.Unknown),
  code: Schema.optional(Schema.String),
  error: Schema.optional(Schema.Unknown),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  message: Schema.optional(Schema.String),
  retryCount: Schema.optional(Schema.Number),
  status: Schema.optional(Schema.Number),
  statusCode: Schema.optional(Schema.Number),
});

type CommercetoolsHttpError = typeof commercetoolsHttpErrorSchema.Type;

export interface CommercetoolsGraphqlProviderError {
  readonly code?: string;
  readonly locations?: readonly {
    readonly column: number;
    readonly line: number;
  }[];
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export interface CommercetoolsGraphqlRequestFailure {
  readonly code?: string;
  readonly correlationId?: string;
  readonly message: string;
  readonly operationKind: Operation["kind"];
  readonly operationName: string;
  readonly providerErrors: readonly CommercetoolsGraphqlProviderError[];
  readonly retryCount?: number;
  readonly statusCode: number;
}

interface CommercetoolsGraphqlExchangeOptions {
  readonly onError?: (failure: CommercetoolsGraphqlRequestFailure) => void;
}

const headerValue = (
  headers: CommercetoolsHttpError["headers"],
  name: string
): string | undefined => {
  const entry = Object.entries(headers ?? {}).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase()
  );
  const value: unknown = entry?.[1];
  return typeof value === "string" ? value : undefined;
};

const providerErrors = (
  error: CommercetoolsHttpError
): readonly CommercetoolsGraphqlProviderError[] => {
  const payload = Option.getOrUndefined(
    Schema.decodeUnknownOption(providerGraphqlErrorPayloadSchema)(
      error.error ?? error.body
    )
  );

  return (payload?.errors ?? []).map((providerError) => ({
    ...(providerError.extensions?.code === undefined &&
    providerError.code === undefined
      ? {}
      : { code: providerError.extensions?.code ?? providerError.code }),
    ...(providerError.locations === undefined
      ? {}
      : { locations: providerError.locations }),
    message: providerError.message,
    ...(providerError.path === undefined ? {} : { path: providerError.path }),
  }));
};

const requestFailure = (
  operation: Operation,
  error: unknown
): CommercetoolsGraphqlRequestFailure => {
  const httpError =
    Option.getOrUndefined(
      Schema.decodeUnknownOption(commercetoolsHttpErrorSchema)(error)
    ) ?? {};
  const correlationId = headerValue(httpError.headers, "x-correlation-id");

  return {
    ...(httpError.code === undefined ? {} : { code: httpError.code }),
    ...(correlationId === undefined ? {} : { correlationId }),
    message: httpError.message ?? "Commercetools GraphQL request failed",
    operationKind: operation.kind,
    operationName: getOperationName(operation.query) ?? "anonymous",
    providerErrors: providerErrors(httpError),
    ...(httpError.retryCount === undefined
      ? {}
      : { retryCount: httpError.retryCount }),
    statusCode: httpError.statusCode ?? httpError.status ?? 0,
  };
};

const executeCommercetoolsRequest = async (
  apiRoot: ByProjectKeyRequestBuilder,
  operation: Operation,
  requestBody: { query: string; variables?: GraphQLVariablesMap },
  options: CommercetoolsGraphqlExchangeOptions
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
    const failure = requestFailure(operation, error);
    options.onError?.(failure);
    return makeErrorResult(
      operation,
      new Error(failure.message, { cause: error }),
      response
    );
  }
};

export const makeCommercetoolsGraphqlExchange =
  (
    apiRoot: ByProjectKeyRequestBuilder,
    options: CommercetoolsGraphqlExchangeOptions = {}
  ): Exchange =>
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
            executeCommercetoolsRequest(
              apiRoot,
              operation,
              {
                query,
                variables: operation.variables || undefined,
              },
              options
            )
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
