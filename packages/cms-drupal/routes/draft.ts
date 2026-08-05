import { cookies, draftMode } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

function isSafePathname(pathname: string): boolean {
  return pathname.startsWith("/") && !pathname.startsWith("//");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  const pathname = request.nextUrl.searchParams.get("originalPathname");

  if (!(token && pathname && isSafePathname(pathname))) {
    return NextResponse.json(
      { error: "A Drupal preview token and local pathname are required" },
      { status: 400 }
    );
  }

  (await draftMode()).enable();

  if (process.env.NODE_ENV === "development") {
    const cookieStore = await cookies();
    const draftCookie = cookieStore.get("__prerender_bypass");
    cookieStore.set({
      httpOnly: true,
      name: "__prerender_bypass",
      path: "/",
      sameSite: "none",
      secure: true,
      value: draftCookie?.value ?? "",
    });
  }

  const destination = new URL(pathname, request.url);
  destination.searchParams.set("redirected", "true");
  destination.searchParams.set("token", token);
  return NextResponse.redirect(destination);
}
