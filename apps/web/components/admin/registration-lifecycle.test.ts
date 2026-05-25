import { expect, test } from "vitest";
import {
  canDecideRegistration,
  getRegistrationDecisionUnavailableMessage,
  registrationStatusFilters,
  registrationStatusLabels,
} from "./registration-lifecycle";

test("admin lifecycle labels cover every registration status", () => {
  expect(registrationStatusLabels).toEqual({
    awaiting_approval: "Awaiting approval",
    approval_processing: "Approval processing",
    approved: "Approved",
    rejected: "Rejected",
  });
});

test("admin lifecycle filters include every visible status", () => {
  expect(registrationStatusFilters).toEqual([
    "awaiting_approval",
    "approved",
    "rejected",
  ]);
});

test("admin decisions are available only for awaiting approval registrations", () => {
  expect(canDecideRegistration("awaiting_approval")).toBe(true);
  expect(canDecideRegistration("approval_processing")).toBe(false);
  expect(canDecideRegistration("approved")).toBe(false);
  expect(canDecideRegistration("rejected")).toBe(false);
});

test("non-decidable statuses explain why actions are unavailable", () => {
  expect(
    getRegistrationDecisionUnavailableMessage("approval_processing")
  ).toContain("processed");
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
