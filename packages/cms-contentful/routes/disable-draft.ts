import type { Route } from "next";
import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";

export async function GET() {
  const draft = await draftMode();
  draft.disable();
  if (process.env.NODE_ENV === "development") {
    const cookieStore = await cookies();
    cookieStore.set({
      expires: new Date(0),
      httpOnly: true,
      name: "__prerender_bypass",
      path: "/",
      sameSite: "none",
      secure: true,
      value: "",
    });
  }

  // SAFETY: The application always serves the localized site root at `/`.
  redirect("/" as Route);
}
