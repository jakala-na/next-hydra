import "server-only";
import { getSignInUrl, withAuth } from "@repo/auth/server";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

export {
  REGISTRATION_DECIDE_PERMISSION as ADMIN_REGISTRATION_DECIDE_PERMISSION,
  REGISTRATION_READ_PERMISSION as ADMIN_REGISTRATION_READ_PERMISSION,
} from "@repo/registration/http/registration-api";

const hasPermission = (
  permissions: readonly string[] | undefined,
  permission: string
) => permissions?.includes(permission) ?? false;

export async function requireAdminPermission(permission: string) {
  const session = await withAuth();

  if (!session.user) {
    const signInUrl = await getSignInUrl();
    redirect(signInUrl as Route);
  }

  if (!hasPermission(session.permissions, permission)) {
    notFound();
  }

  return session;
}
