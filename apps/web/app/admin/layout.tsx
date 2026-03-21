import { AdminShell } from "@/components/admin/admin-shell";
import {
  ADMIN_REGISTRATION_READ_PERMISSION,
  requireAdminPermission,
} from "@/lib/admin-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPermission(ADMIN_REGISTRATION_READ_PERMISSION);

  return <AdminShell>{children}</AdminShell>;
}
