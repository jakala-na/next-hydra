import { getSignUpUrl } from "@workos-inc/authkit-nextjs";
import type { Route } from "next";
import { redirect } from "next/navigation";

export const GET = async () => {
  const signUpUrl = await getSignUpUrl();
  redirect(signUpUrl as unknown as Route);
};
