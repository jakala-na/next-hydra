import "server-only";
import type { SearchAudience, SearchBatch, SearchProvider } from "./contract";
import { InvalidSearchRequestError, validateSearchBatch } from "./validation";

export interface SearchRouteDependencies {
  readonly provider: SearchProvider;
  readonly resolveAudience: (
    batch: SearchBatch,
    request: Request
  ) => Promise<SearchAudience>;
}

const privateResponseHeaders = {
  "Cache-Control": "private, no-store",
} as const;

const errorResponse = (
  status: number,
  code: "INVALID_SEARCH_REQUEST" | "SEARCH_UNAVAILABLE",
  requestId: string
) =>
  Response.json(
    { error: { code, requestId } },
    { headers: privateResponseHeaders, status }
  );

export const makeSearchRouteHandler =
  ({ provider, resolveAudience }: SearchRouteDependencies) =>
  async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();

    try {
      const body: unknown = await request.json();
      const batch = validateSearchBatch(body);
      const audience = await resolveAudience(batch, request);
      const result = await provider.search(batch, audience, request.signal);

      return Response.json(result, { headers: privateResponseHeaders });
    } catch (error) {
      if (
        error instanceof InvalidSearchRequestError ||
        error instanceof SyntaxError
      ) {
        return errorResponse(400, "INVALID_SEARCH_REQUEST", requestId);
      }

      // oxlint-disable-next-line no-console -- Route failures must reach the application logger without exposing provider details to the client.
      console.error("Search proxy request failed", { error, requestId });
      return errorResponse(503, "SEARCH_UNAVAILABLE", requestId);
    }
  };
