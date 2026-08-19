import { expect, test } from "vitest";

import {
  canDecideRegistration,
  getRegistrationDecisionUnavailableMessage,
  registrationStatusFilters,
  registrationStatusLabels,
} from "./registration-lifecycle";

test("admin lifecycle labels cover every registration status", () => {
  expect(registrationStatusLabels).toStrictEqual({
    approval_processing: "Approval processing",
    approved: "Approved",
    awaiting_approval: "Awaiting approval",
    rejected: "Rejected",
  });
});

test("admin lifecycle filters include every visible status", () => {
  expect(registrationStatusFilters).toStrictEqual([
    "awaiting_approval",
    "approved",
    "rejected",
  ]);
});

test("admin decisions are available only for awaiting approval registrations", () => {
  expect(canDecideRegistration("awaiting_approval")).toBeTruthy();
  expect(canDecideRegistration("approval_processing")).toBeFalsy();
  expect(canDecideRegistration("approved")).toBeFalsy();
  expect(canDecideRegistration("rejected")).toBeFalsy();
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
  expect(
    getRegistrationDecisionUnavailableMessage("awaiting_approval")
  ).toBeUndefined();
});
