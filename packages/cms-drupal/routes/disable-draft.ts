import type { Route } from "next";
import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";

export async function GET(): Promise<never> {
  (await draftMode()).disable();
  if (process.env.NODE_ENV === "development") {
    (await cookies()).set({
      expires: new Date(0),
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
