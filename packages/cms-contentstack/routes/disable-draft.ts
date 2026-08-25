import type { Route } from "next";
import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";

export async function GET() {
  (await draftMode()).disable();
  // Set __prerender_bypass expire date to past.
  if (process.env.NODE_ENV === "development") {
    (await cookies()).set({
      expires: new Date(0), // Set expiration date to the past
      httpOnly: true,
      name: "__prerender_bypass",
      path: "/",
      sameSite: "none",
      secure: true,
      value: "",
    });
  }

  redirect("/" as Route);
}
