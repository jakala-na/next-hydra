import "server-only";
import { getSignInUrl, withAuth } from "@repo/auth/server";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

export {
  REGISTRATION_DECIDE_PERMISSION as ADMIN_REGISTRATION_DECIDE_PERMISSION,
  REGISTRATION_READ_PERMISSION as ADMIN_REGISTRATION_READ_PERMISSION,
} from "@repo/registration/http/registration-api";

export async function requireAdminPermission(permission: string) {
  const session = await withAuth();

  if (!session.user) {
    const signInUrl = await getSignInUrl();
    redirect(signInUrl as Route);
  }

  if (!session.permissions.has(permission)) {
    notFound();
  }

  return session;
}
