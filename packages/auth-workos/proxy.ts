import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import type { NextProxy, NextRequest } from "next/server";

const isTerminatingResponse = (response: NextResponse) =>
  response.headers.has("x-middleware-rewrite") ||
  response.headers.has("location") ||
  response.headers.get("content-type")?.includes("application/json") === true;

const forwardResponseHeaders = (
  response: NextResponse,
  request: NextRequest
) => {
  for (const [name, value] of response.headers) {
    if (name.startsWith("x-middleware-request-")) {
      request.headers.set(name.replace("x-middleware-request-", ""), value);
    } else if (!name.startsWith("x-middleware-")) {
      request.headers.set(name, value);
    }
  }
};

export const authProxy = (next?: NextProxy): NextProxy => {
  const auth = authkitMiddleware();

  if (next === undefined) {
    return auth;
  }

  return async (request, event) => {
    const response = await auth(request, event);

    if (!(response instanceof NextResponse)) {
      return response ?? (await next(request, event));
    }
    if (isTerminatingResponse(response)) {
      return response;
    }

    forwardResponseHeaders(response, request);
    return (await next(request, event)) ?? response;
  };
};
