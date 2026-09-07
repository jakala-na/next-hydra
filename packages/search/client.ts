import type { SearchClient } from "instantsearch.js";
import { z } from "zod";

const AUTOCOMPLETE_PROXY_CREDENTIAL = "search-proxy";

interface AutocompleteProxySearchClient extends SearchClient {
  /**
   * Autocomplete's Algolia requester reads these fields to annotate returned
   * hits. They are compatibility markers only and are never sent to the proxy.
   */
  readonly transporter: {
    readonly headers: {
      readonly "x-algolia-api-key": string;
      readonly "x-algolia-application-id": string;
    };
  };
}

const responseEnvelopeSchema = z
  .object({ results: z.array(z.unknown()) })
  .passthrough();

const errorEnvelopeSchema = z
  .object({
    error: z.object({ requestId: z.string().optional() }).passthrough(),
  })
  .passthrough();

const autocompleteRequestSchema = z
  .object({ query: z.string().optional() })
  .passthrough();

export class SearchProxyError extends Error {
  readonly requestId?: string;

  constructor(message: string, requestId?: string) {
    super(message);
    this.name = "SearchProxyError";
    this.requestId = requestId;
  }
}

const normalizeAutocompleteRequest = (
  request: Parameters<SearchClient["search"]>[0][number]
): Parameters<SearchClient["search"]>[0][number] => {
  const { query } = autocompleteRequestSchema.parse(request);
  if (query === undefined) {
    return request;
  }
  return {
    indexName: request.indexName,
    params: { ...request.params, query },
  };
};

export function createProxySearchClient(endpoint: string): SearchClient {
  return {
    search: async (requests) => {
      const response = await fetch(endpoint, {
        body: JSON.stringify({
          requests: requests.map(normalizeAutocompleteRequest),
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const errorEnvelope = errorEnvelopeSchema.safeParse(payload);
        throw new SearchProxyError(
          "Search is unavailable",
          errorEnvelope.success ? errorEnvelope.data.error.requestId : undefined
        );
      }

      const envelope = responseEnvelopeSchema.safeParse(payload);
      if (!envelope.success) {
        throw new SearchProxyError("Search returned an invalid response");
      }

      // SAFETY: The same-origin proxy returns the provider's InstantSearch
      // envelope, and the structural results array was parsed above.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- InstantSearch result hits remain provider-generic at this protocol boundary.
      return envelope.data as Awaited<ReturnType<SearchClient["search"]>>;
    },
  };
}

export function createAutocompleteProxySearchClient(
  endpoint: string
): AutocompleteProxySearchClient {
  return {
    ...createProxySearchClient(endpoint),
    transporter: {
      headers: {
        "x-algolia-api-key": AUTOCOMPLETE_PROXY_CREDENTIAL,
        "x-algolia-application-id": AUTOCOMPLETE_PROXY_CREDENTIAL,
      },
    },
  };
}
