import "../[locale]/styles.css";
import { AdminShell } from "@/components/admin/admin-shell";
import { DocumentShell } from "@/components/layout/document-shell";
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
  await requireAdminPermission(ADMIN_REGISTRATION_READ_PERMISSION);

  return (
    <DocumentShell lang="en-US">
      <AdminShell>{children}</AdminShell>
    </DocumentShell>
  );
}
