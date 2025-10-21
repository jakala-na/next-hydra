import { log } from "@repo/observability/log";
import { createClient } from "@urql/core";
import memoize from "lodash.memoize";
import { mapExchange } from "urql";
import { ctExchange } from "./ct-exchange";

const makeClient = () => {
  return createClient({
    url: "<NOT USED>",
    exchanges: [
      /**
       * It may seem counter-intuitive, but exchanges are bi-directional, so mapExchange can both pass things to fetch,
       * as well as receive errors back from fetch on it's way back.
       * This exchange is meant to be before fetch!
       *
       * @see https://github.com/urql-graphql/urql/issues/225#issuecomment-482592203
       */
      mapExchange({
        onError: (error) => {
          // Filter out expected errors, pass others to the server.
          const errors = error.graphQLErrors.filter(
            (err) => err.message !== "PersistedQueryNotFound"
          );

          if (errors.length > 0) {
            log.error("GraphQL Errors:", {
              graphQlErrors: JSON.stringify(errors, null, 2),
            });
          }
        },
        // onOperation(operation) {
        //   console.dir(operation, { depth: null, colors: true });
        // },
      }),
      ctExchange,
    ],
  });
};

/**
 * Use memoize to share a client between all requests.
 * While urql docs mention using registerUrql to memoize the client,
 * at the moment of writing, registerUrql uses React.cache which works only in RSCs.
 *
 * We use lodash.memoize to allow usage in server-actions and other non-RSC cases.
 *
 * @see https://react.dev/reference/react/cache#pitfall-memoized-call-outside-component
 * @see https://commerce.nearform.com/open-source/urql/docs/advanced/server-side-rendering/#nextjs
 */

export const graphqlClient: () => ReturnType<typeof makeClient> =
  memoize(makeClient);
