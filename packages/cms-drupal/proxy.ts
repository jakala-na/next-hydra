import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const DRUPAL_PREVIEW_HEADER = "x-drupal-preview-token";

export function cmsProxy(
  request: NextRequest
): NextResponse<unknown> | undefined {
  const { nextUrl } = request;
  const token = nextUrl.searchParams.get("token");
  if (!token) {
    return;
  }

  const redirected = nextUrl.searchParams.get("redirected");
  if (nextUrl.pathname !== "/api/draft" && redirected !== "true") {
    const draftUrl = new URL("/api/draft", request.url);
    draftUrl.searchParams.set("originalPathname", nextUrl.pathname);
    draftUrl.searchParams.set("token", token);
    return NextResponse.redirect(draftUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(DRUPAL_PREVIEW_HEADER, token);
  return NextResponse.next({ request: { headers: requestHeaders } });
}
