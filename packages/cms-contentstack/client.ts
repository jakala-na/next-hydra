/**
 * This file is a server-only file, meaning it should not be included in the client bundle.
 * @see https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment
 */

import "server-only";
import { createClient, fetchExchange } from "@urql/core";
import memoize from "lodash.memoize";
import { mapExchange } from "urql";

import { keys } from "./keys";

interface ContentstackHeaders extends Record<string, string> {
  readonly access_token: string;
}

const makeClient = (livePreviewHash?: string) => {
  const graphqlEndpoint = `https://${livePreviewHash ? keys().CONTENTSTACK_LIVE_PREVIEW_HOST_NAME : keys().CONTENTSTACK_GRAPHQL_HOST_NAME}/stacks/${keys().CONTENTSTACK_API_KEY}?environment=${keys().CONTENTSTACK_ENVIRONMENT}`;

  const headers: ContentstackHeaders = {
    access_token: keys().CONTENTSTACK_DELIVERY_TOKEN,
  };

  if (livePreviewHash !== undefined) {
    headers.live_preview = livePreviewHash;
    headers.preview_token = keys().CONTENTSTACK_PREVIEW_TOKEN;
  }

  return createClient({
    exchanges: [
      /**
       * It may seem counter-intuitive, but exchanges are bi-directional, so mapExchange can both pass things to fetch,
       * as well as receive errors back from fetch on it's way back.
       * This exchange is meant to be before fetch!
       *
       * @see https://github.com/urql-graphql/urql/issues/225#issuecomment-482592203
       */
      mapExchange({
        onError: (error, operation) => {
          // Filter out expected errors like PERSISTED_QUERY_NOT_FOUND, pass others to the server.
          const errors = error.graphQLErrors.filter(
            (err) => err.message !== "PersistedQueryNotFound"
          );

          if (errors.length > 0) {
            // A future observability integration should capture these errors.
            // eslint-disable-next-line no-console -- logging errors to node.js console
            console.error("GraphQL Errors:", JSON.stringify(errors, null, 2));

            console.dir(operation.query.loc?.source?.body, {
              colors: true,
              depth: null,
            });
          }
        },
        onOperation() {
          // console.dir(operation, { depth: null, colors: true });
        },
      }),
      fetchExchange,
    ],
    fetchOptions: {
      headers,
    },
    url: graphqlEndpoint,
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

export const graphqlClient: (
  livePreviewHash?: string
) => ReturnType<typeof makeClient> = memoize(makeClient);
