import "server-only";

import { getSignInUrl, withAuth } from "@repo/auth-workos/server";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

export const ADMIN_REGISTRATION_READ_PERMISSION = "registration.read";
export const ADMIN_REGISTRATION_DECIDE_PERMISSION = "registration.decide";

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

export async function getAdminActor() {
  const session = await requireAdminPermission(
    ADMIN_REGISTRATION_DECIDE_PERMISSION
  );
  const actorName = [session.user.firstName, session.user.lastName]
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    )
    .join(" ");

  return {
    actorEmail: session.user.email ?? undefined,
    actorName: actorName || session.user.email || undefined,
  };
}
