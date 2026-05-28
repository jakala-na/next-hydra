import { Badge } from "@repo/design-system/components/ui/badge";
import { registrationStatusLabels } from "./registration-lifecycle";
import type { RegistrationDetailStatus } from "./registration-view-models";

const statusVariantMap: Record<
  RegistrationDetailStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  awaiting_approval: "secondary",
  approval_processing: "secondary",
  approved: "default",
  rejected: "destructive",
};

export function RegistrationStatusBadge({
  status,
}: {
  status: RegistrationDetailStatus;
}) {
  return (
    <Badge variant={statusVariantMap[status]}>
      {registrationStatusLabels[status]}
    </Badge>
  );
}
