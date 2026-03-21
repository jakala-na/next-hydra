import { Badge } from "@repo/design-system/components/ui/badge";
import type { RegistrationStatus } from "@repo/registration/domain/types";

const statusLabelMap: Record<RegistrationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  workflow_start_failed: "Workflow failed",
};

const statusVariantMap: Record<
  RegistrationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  workflow_start_failed: "outline",
};

export function RegistrationStatusBadge({
  status,
}: {
  status: RegistrationStatus;
}) {
  return (
    <Badge variant={statusVariantMap[status]}>{statusLabelMap[status]}</Badge>
  );
}
