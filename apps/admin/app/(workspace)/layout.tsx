import { getAuthRoutes } from "@repo/auth/server";

import { AdminShell } from "@/components/admin/admin-shell";
import {
  ADMIN_REGISTRATION_READ_PERMISSION,
  requireAdminPermission,
} from "@/lib/admin-auth";

export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [, routes] = await Promise.all([
    requireAdminPermission(ADMIN_REGISTRATION_READ_PERMISSION),
    getAuthRoutes(),
  ]);

  return <AdminShell signOutHref={routes.signOutHref}>{children}</AdminShell>;
}
