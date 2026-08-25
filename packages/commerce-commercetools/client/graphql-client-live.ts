import { log } from "@repo/observability/log";
import { createClient } from "@urql/core";
import { Effect, Layer } from "effect";
import { mapExchange } from "urql";

import { CommercetoolsGraphQLClient } from "./graphql-client";
import { makeCommercetoolsGraphqlExchange } from "./graphql-exchange";
import { CommercetoolsRestClient } from "./rest-client";

export const graphqlClientLayer = Layer.effect(
  CommercetoolsGraphQLClient,
  Effect.gen(function* () {
    const restClient = yield* CommercetoolsRestClient;
    const client = createClient({
      exchanges: [
        mapExchange({
          onError: (error) => {
            const unexpectedErrors = error.graphQLErrors.filter(
              ({ message }) => message !== "PersistedQueryNotFound"
            );

            if (unexpectedErrors.length > 0) {
              log.error("GraphQL Errors:", {
                graphQlErrors: JSON.stringify(unexpectedErrors, null, 2),
              });
            }
          },
        }),
        makeCommercetoolsGraphqlExchange(restClient.apiRoot, {
          onError: (failure) => {
            log.error("Commercetools GraphQL request failed", failure);
          },
        }),
      ],
      url: "<NOT USED>",
    });

    return CommercetoolsGraphQLClient.of({
      mutation: client.mutation.bind(client),
      query: client.query.bind(client),
    });
  })
);
