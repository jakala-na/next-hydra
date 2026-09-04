import { cookies, draftMode } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { keys } from "../keys";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = request.nextUrl.searchParams.get("secret");
  const slug = request.nextUrl.searchParams.get("slug");

  if (secret !== keys().CONTENTFUL_PREVIEW_SECRET) {
    return NextResponse.json(
      { error: "Invalid Contentful preview secret" },
      { status: 401 }
    );
  }

  const draft = await draftMode();
  draft.enable();

  if (process.env.NODE_ENV === "development") {
    const cookieStore = await cookies();
    const cookie = cookieStore.get("__prerender_bypass");
    cookieStore.set({
      httpOnly: true,
      name: "__prerender_bypass",
      path: "/",
      sameSite: "none",
      secure: true,
      value: cookie?.value ?? "",
    });
  }

  const destination = slug?.startsWith("/") ? slug : "/";
  return NextResponse.redirect(new URL(destination, request.url));
}
