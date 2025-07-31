import { cookies, draftMode } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // TODO: Validate live preview token if possible.
  (await draftMode()).enable();

  // Set the __prerender_bypass as secure for local environment.
  // Will work only in next dev mode.
  // https://github.com/vercel/next.js/issues/49927
  if (process.env.NODE_ENV === 'development') {
    const cookieStore = await cookies();
    const cookie = cookieStore.get('__prerender_bypass');
    (await cookies()).set({
      name: '__prerender_bypass',
      value: cookie?.value ?? '',
      httpOnly: true,
      path: '/',
      secure: true,
      sameSite: 'none',
    });
  }

  const url = req.nextUrl;
  const livePreviewToken = url.searchParams.get('live_preview');
  const pathname = url.searchParams.get('originalPathname');
  if (livePreviewToken && pathname) {
    // Redirect to original path redirected=true to prevent infinite redirects.
    url.searchParams.set('redirected', 'true');
    url.searchParams.delete('originalPathname');
    return NextResponse.redirect(new URL(`${pathname}?${url.searchParams.toString()}`, url));
  }

  // Error if no live preview token or pathname
  return NextResponse.json({ error: 'No live preview token or pathname' }, { status: 400 });
}
