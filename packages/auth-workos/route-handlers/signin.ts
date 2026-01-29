import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import type { Route } from "next";
import { redirect } from "next/navigation";

export const GET = async () => {
  const signInUrl = await getSignInUrl();
  redirect(signInUrl as unknown as Route);
};
