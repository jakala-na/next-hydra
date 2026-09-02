import type { SearchClient } from "instantsearch.js";
import { z } from "zod";

const responseEnvelopeSchema = z
  .object({ results: z.array(z.unknown()) })
  .passthrough();

const errorEnvelopeSchema = z
  .object({
    error: z.object({ requestId: z.string().optional() }).passthrough(),
  })
  .passthrough();

export class SearchProxyError extends Error {
  readonly requestId?: string;

  constructor(message: string, requestId?: string) {
    super(message);
    this.name = "SearchProxyError";
    this.requestId = requestId;
  }
}

export function createProxySearchClient(endpoint: string): SearchClient {
  return {
    search: async (requests) => {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ requests }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const errorEnvelope = errorEnvelopeSchema.safeParse(payload);
        throw new SearchProxyError(
          "Product search is unavailable",
          errorEnvelope.success ? errorEnvelope.data.error.requestId : undefined
        );
      }

      const envelope = responseEnvelopeSchema.safeParse(payload);
      if (!envelope.success) {
        throw new SearchProxyError(
          "Product search returned an invalid response"
        );
      }

      // SAFETY: The same-origin proxy returns the provider's InstantSearch
      // envelope, and the structural results array was parsed above.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- InstantSearch result hits remain provider-generic at this protocol boundary.
      return envelope.data as Awaited<ReturnType<SearchClient["search"]>>;
    },
  };
}
