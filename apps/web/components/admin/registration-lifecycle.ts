import type { RegistrationConflictReason } from "@repo/registration/domain/errors";
import type { RegistrationStatus } from "@repo/registration/domain/types";

export const registrationStatusLabels: Record<RegistrationStatus, string> = {
  submitted: "Submitted",
  awaiting_approval: "Awaiting approval",
  approval_processing: "Approval processing",
  submission_incomplete: "Submission incomplete",
  approved: "Approved",
  rejected: "Rejected",
};

export const registrationStatusFilters = [
  "submitted",
  "awaiting_approval",
  "approval_processing",
  "submission_incomplete",
  "approved",
  "rejected",
] as const satisfies readonly RegistrationStatus[];

export const canDecideRegistration = (status: RegistrationStatus) =>
  status === "awaiting_approval";

export const getRegistrationDecisionUnavailableMessage = (
  status: RegistrationStatus
) => {
  switch (status) {
    case "submitted":
      return "This registration has been submitted but is not ready for approval yet.";
    case "approval_processing":
      return "A decision is already being processed for this registration.";
    case "submission_incomplete":
      return "This registration did not complete submission and cannot be approved or rejected.";
    case "approved":
    case "rejected":
      return "This registration is finalized and cannot be updated from the dashboard.";
    case "awaiting_approval":
      return undefined;
    default:
      return status satisfies never;
  }
};

export const getRegistrationDecisionConflictMessage = (
  reason: RegistrationConflictReason
) => {
  switch (reason) {
    case "approval_not_ready":
      return "This registration is submitted but is not ready for approval yet.";
    case "registration_submission_incomplete":
      return "This registration did not complete submission and cannot be approved or rejected.";
    case "decision_already_in_progress":
      return "A decision is already being processed for this registration.";
    case "approved_registration_cannot_be_rejected":
      return "This registration is already approved and cannot be rejected.";
    case "rejected_registration_cannot_be_approved":
      return "This registration is already rejected and cannot be approved.";
    default:
      return reason satisfies never;
  }
};
