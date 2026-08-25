import "server-only";
import { createClient, fetchExchange } from "@urql/core";

import { getDrupalAccessToken } from "./auth";
import type { DrupalAccessMode } from "./auth";
import { getDrupalGraphqlUri, keys } from "./keys";

const clients = new Map<DrupalAccessMode, ReturnType<typeof createClient>>();

function createAuthenticatedFetch(mode: DrupalAccessMode): typeof fetch {
  return async function fetchWithDrupalAuth(input, init) {
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined
    );
    new Headers(init?.headers).forEach((value, name) => {
      headers.set(name, value);
    });
    headers.set("authorization", await getDrupalAccessToken(mode));

    return await globalThis.fetch(input, { ...init, headers });
  };
}

export function graphqlClient(
  preview = false
): ReturnType<typeof createClient> {
  const mode: DrupalAccessMode = preview ? "previewer" : "viewer";
  const cached = clients.get(mode);
  if (cached) {
    return cached;
  }

  const config = keys();
  const client = createClient({
    exchanges: [fetchExchange],
    fetch: createAuthenticatedFetch(mode),
    url: getDrupalGraphqlUri(config),
  });
  clients.set(mode, client);
  return client;
}
