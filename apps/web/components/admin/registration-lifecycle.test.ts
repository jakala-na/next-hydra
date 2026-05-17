import { expect, test } from "vitest";
import {
  canDecideRegistration,
  getRegistrationDecisionConflictMessage,
  getRegistrationDecisionUnavailableMessage,
  registrationStatusFilters,
  registrationStatusLabels,
} from "./registration-lifecycle";

test("admin lifecycle labels cover every registration status", () => {
  expect(registrationStatusLabels).toEqual({
    submitted: "Submitted",
    awaiting_approval: "Awaiting approval",
    approval_processing: "Approval processing",
    submission_incomplete: "Submission incomplete",
    approved: "Approved",
    rejected: "Rejected",
  });
});

test("admin lifecycle filters include every visible status", () => {
  expect(registrationStatusFilters).toEqual([
    "submitted",
    "awaiting_approval",
    "approval_processing",
    "submission_incomplete",
    "approved",
    "rejected",
  ]);
});

test("admin decisions are available only for awaiting approval registrations", () => {
  expect(canDecideRegistration("awaiting_approval")).toBe(true);
  expect(canDecideRegistration("submitted")).toBe(false);
  expect(canDecideRegistration("approval_processing")).toBe(false);
  expect(canDecideRegistration("submission_incomplete")).toBe(false);
  expect(canDecideRegistration("approved")).toBe(false);
  expect(canDecideRegistration("rejected")).toBe(false);
});

test("non-decidable statuses explain why actions are unavailable", () => {
  expect(getRegistrationDecisionUnavailableMessage("submitted")).toContain(
    "not ready for approval"
  );
  expect(
    getRegistrationDecisionUnavailableMessage("approval_processing")
  ).toContain("already being processed");
  expect(
    getRegistrationDecisionUnavailableMessage("submission_incomplete")
  ).toContain("did not complete submission");
  expect(getRegistrationDecisionUnavailableMessage("approved")).toContain(
    "finalized"
  );
  expect(getRegistrationDecisionUnavailableMessage("rejected")).toContain(
    "finalized"
  );
  expect(getRegistrationDecisionUnavailableMessage("awaiting_approval")).toBe(
    undefined
  );
});

test("precise decision conflicts have precise admin messages", () => {
  expect(
    getRegistrationDecisionConflictMessage("approval_not_ready")
  ).toContain("not ready for approval");
  expect(
    getRegistrationDecisionConflictMessage("registration_submission_incomplete")
  ).toContain("did not complete submission");
  expect(
    getRegistrationDecisionConflictMessage("decision_already_in_progress")
  ).toContain("already being processed");
  expect(
    getRegistrationDecisionConflictMessage(
      "approved_registration_cannot_be_rejected"
    )
  ).toContain("already approved");
  expect(
    getRegistrationDecisionConflictMessage(
      "rejected_registration_cannot_be_approved"
    )
  ).toContain("already rejected");
});
