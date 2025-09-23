/**
 * This file is a server-only file, meaning it should not be included in the client bundle.
 * @see https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment
 */

import 'server-only';

import { createClient, fetchExchange } from '@urql/core';
import memoize from 'lodash.memoize';
import { mapExchange } from 'urql';
import { keys } from './keys';

async function getAuthHeaders() {
  const {
    COMMERCETOOLS_CLIENT_ID,
    COMMERCETOOLS_CLIENT_SECRET,
    COMMERCETOOLS_SCOPE,
    COMMERCETOOLS_REGION,
  } = keys();

  // Get OAuth token
  const tokenResponse = await fetch(
    `https://auth.${COMMERCETOOLS_REGION}.commercetools.com/oauth/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${COMMERCETOOLS_CLIENT_ID}:${COMMERCETOOLS_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: `grant_type=client_credentials&scope=${COMMERCETOOLS_SCOPE}`,
    }
  );

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get OAuth token: ${tokenResponse.statusText}`);
  }

  const tokenData = await tokenResponse.json();

  return {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
  };
}

const makeClient = () => {
  const { COMMERCETOOLS_PROJECT_KEY, COMMERCETOOLS_REGION } = keys();

  const graphqlEndpoint = `https://api.${COMMERCETOOLS_REGION}.commercetools.com/${COMMERCETOOLS_PROJECT_KEY}/graphql`;

  return createClient({
    url: graphqlEndpoint,
    fetch: async (url, options = {}) => {
      const authHeaders = await getAuthHeaders();
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          ...authHeaders.headers,
        },
      });
    },
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
            (err) => err.message !== 'PersistedQueryNotFound'
          );

          if (errors.length > 0) {
            // TODO: Add Sentry or similar error reporting.
            // biome-ignore lint/suspicious/noConsole: surfacing provider GraphQL errors on the server.
            console.error('GraphQL Errors:', JSON.stringify(errors, null, 2));
          }
        },
        onOperation() {
          // console.dir(operation, { depth: null, colors: true });
        },
      }),
      fetchExchange,
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
