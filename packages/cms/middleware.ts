import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const cmsMiddleware = (request: NextRequest): NextResponse<unknown> | undefined => {
  // Identify if live_preview query param is present and redirect to /api/draft?originalUrl=<currentUrl>&[queryParams]
  // TODO: There is no way to validate if live preview token was legit, so path with secret from Contentstack that we proxy to regular path is needed.
  const url = request.nextUrl;
  const searchParams = url.searchParams;
  const originalPathname = url.pathname;
  const livePreview = searchParams.get('live_preview');
  const redirected = searchParams.get('redirected');

  if (livePreview && originalPathname !== '/api/draft' && !redirected) {
    const queryParams = searchParams.toString();
    const previewUrl = `/api/draft?originalPathname=${originalPathname}&${queryParams}`;
    return NextResponse.redirect(new URL(previewUrl, request.url));
  }

  // If we have a live_preview search param, pass it as a header to the request
  // This is used in server components in layout.tsx where searchParams is not available.
  if (livePreview) {
    const response = NextResponse.next();
    response.headers.set('x-live-preview', livePreview);
    return response;
  }
};
