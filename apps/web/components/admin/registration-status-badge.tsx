import { Badge } from "@repo/design-system/components/ui/badge";
import type { RegistrationStatus } from "@repo/registration/domain/types";
import { registrationStatusLabels } from "./registration-lifecycle";

const statusVariantMap: Record<
  RegistrationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  submitted: "secondary",
  awaiting_approval: "secondary",
  approval_processing: "outline",
  submission_incomplete: "outline",
  approved: "default",
  rejected: "destructive",
};

export function RegistrationStatusBadge({
  status,
}: {
  status: RegistrationStatus;
}) {
  return (
    <Badge variant={statusVariantMap[status]}>
      {registrationStatusLabels[status]}
    </Badge>
  );
}
