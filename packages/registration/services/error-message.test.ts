import { CommerceAccountUnavailable } from "@repo/commerce/services/commerce-accounts";
import { EmailProviderFailure } from "@repo/email";
import { StoreConflict, StoreError } from "@repo/versioned-store";
import { describe, expect, it } from "vitest";

import { InvitationId, RegistrationId } from "../domain/identity";
import { InvitationPolicyError } from "./company-invitation-policy";
import {
  InvitationConflict,
  InvitationNotFound,
  InvitationProviderFailure,
} from "./invitations";
import { RegistrationEmailFailure } from "./registration-emails";
import {
  RegistrationQueryFailure,
  RegistrationQueryInvalidCursor,
} from "./registration-queries";
import {
  RegistrationConcurrentModification,
  RegistrationNotFound,
  RegistrationNotFoundByInvitationId,
  RegistrationPersistenceFailure,
  RegistrationTransitionConflict,
} from "./registrations";

const registrationId = RegistrationId.make("registration-1");
const invitationId = InvitationId.make("invitation-1");

describe("workflow-facing tagged error messages", () => {
  it("delegates reason fields to native error messages", () => {
    expect(
      new CommerceAccountUnavailable({
        message: "commerce down",
      }).message
    ).toBe("commerce down");
    expect(
      new InvitationConflict({ message: "already accepted" }).message
    ).toBe("already accepted");
    expect(
      new InvitationPolicyError({ message: "owner required" }).message
    ).toBe("owner required");
  });

  it("formats cause fields into native error messages", () => {
    expect(
      new RegistrationPersistenceFailure({
        cause: new Error("store down"),
        message: "Failed to update registration registration-1: store down",
        operation: "update",
        reason: "unavailable",
        registrationId,
      }).message
    ).toBe("Failed to update registration registration-1: store down");

    expect(
      new InvitationProviderFailure({
        cause: new Error("provider down"),
        message: "Failed to issue invitation: provider down",
        operation: "issue",
      }).message
    ).toBe("Failed to issue invitation: provider down");

    expect(
      new RegistrationEmailFailure({
        cause: "resend down",
        message: "Failed to send registrant_approved email: resend down",
        notification: "registrant_approved",
      }).message
    ).toBe("Failed to send registrant_approved email: resend down");

    expect(
      new EmailProviderFailure({
        cause: { status: 500 },
        message: "Failed to send email: [object Object]",
        operation: "send",
      }).message
    ).toBe("Failed to send email: [object Object]");

    expect(
      new RegistrationQueryFailure({
        cause: new Error("query failed"),
        message: "Failed to list registrations: query failed",
        operation: "list",
        reason: "unavailable",
      }).message
    ).toBe("Failed to list registrations: query failed");

    expect(
      new StoreError({
        cause: new Error("decode failed"),
        key: "registration-1",
        message: "Failed to read store value registration-1: decode failed",
        operation: "read",
        reason: "invalidData",
      }).message
    ).toBe("Failed to read store value registration-1: decode failed");
  });

  it("gives structured workflow domain errors useful native messages", () => {
    expect(
      new RegistrationNotFound({
        message: "Registration registration-1 was not found",
        registrationId,
      }).message
    ).toBe("Registration registration-1 was not found");
    expect(
      new RegistrationNotFoundByInvitationId({
        invitationId,
        message: "Registration for invitation invitation-1 was not found",
      }).message
    ).toBe("Registration for invitation invitation-1 was not found");
    expect(
      new RegistrationTransitionConflict({
        attemptedDecision: "approved",
        currentState: "rejected",
        message:
          "Cannot mark registration registration-1 as approved from rejected",
        registrationId,
      }).message
    ).toBe("Cannot mark registration registration-1 as approved from rejected");
    expect(
      new RegistrationConcurrentModification({
        message: "Registration registration-1 was modified concurrently",
        registrationId,
      }).message
    ).toBe("Registration registration-1 was modified concurrently");
    expect(
      new InvitationNotFound({
        invitationId,
        message: "Invitation invitation-1 was not found",
      }).message
    ).toBe("Invitation invitation-1 was not found");
    expect(
      new RegistrationQueryInvalidCursor({
        cursor: "bad-cursor",
        message: "Invalid registration query cursor for list: bad-cursor",
        operation: "list",
      }).message
    ).toBe("Invalid registration query cursor for list: bad-cursor");
    expect(
      new StoreConflict({
        key: "registration-1",
        message: "Store update conflict for registration-1: version mismatch",
        operation: "update",
      }).message
    ).toBe("Store update conflict for registration-1: version mismatch");
  });
});
