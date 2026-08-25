import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import type { HttpErrorType } from "@commercetools/ts-client";
import { createClient, fetchExchange, gql } from "@urql/core";
import { describe, expect, it, vi } from "vitest";

import { makeCommercetoolsGraphqlExchange } from "./graphql-exchange";

const executeExchange = async (
  error: HttpErrorType,
  onError: ReturnType<typeof vi.fn>
) => {
  const execute = vi.fn().mockRejectedValue(error);
  const apiRoot = {
    graphql: () => ({
      post: () => ({ execute }),
    }),
  } as unknown as ByProjectKeyRequestBuilder;
  const client = createClient({
    exchanges: [
      makeCommercetoolsGraphqlExchange(apiRoot, { onError }),
      fetchExchange,
    ],
    url: "https://api.example.com/project/graphql",
  });

  return await client
    .query(
      gql`
        query ProviderProductSelectionAssignments {
          __typename
        }
      `,
      {}
    )
    .toPromise();
};

describe("Commercetools GraphQL exchange", () => {
  it("reports exact sanitized provider errors and preserves the original cause", async () => {
    const error = {
      code: "BadRequest",
      error: {
        errors: [
          {
            extensions: { code: "InvalidInput" },
            locations: [{ column: 43, line: 1 }],
            message:
              "Variable '$storeKey' expected value of type 'KeyReferenceInput!'",
            path: ["inStore"],
          },
        ],
      },
      headers: { "x-correlation-id": "correlation-123" },
      message: "Unexpected non-JSON error response",
      method: "POST",
      originalRequest: {
        body: { variables: { customerId: "customer-1" } },
        headers: { Authorization: "Bearer must-not-be-logged" },
        method: "POST",
      },
      retryCount: 2,
      status: 400,
      statusCode: 400,
    } satisfies HttpErrorType;
    const onError = vi.fn();

    const result = await executeExchange(error, onError);

    expect(onError).toHaveBeenCalledWith({
      code: "BadRequest",
      correlationId: "correlation-123",
      message: "Unexpected non-JSON error response",
      operationKind: "query",
      operationName: "ProviderProductSelectionAssignments",
      providerErrors: [
        {
          code: "InvalidInput",
          locations: [{ column: 43, line: 1 }],
          message:
            "Variable '$storeKey' expected value of type 'KeyReferenceInput!'",
          path: ["inStore"],
        },
      ],
      retryCount: 2,
      statusCode: 400,
    });
    expect(JSON.stringify(onError.mock.calls)).not.toContain("customer-1");
    expect(JSON.stringify(onError.mock.calls)).not.toContain(
      "must-not-be-logged"
    );
    expect(result.error?.networkError?.cause).toBe(error);
  });
});
