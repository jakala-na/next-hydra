import { EmailProviderFailure } from "@repo/email";
import { StoreConflict, StoreError } from "@repo/versioned-store";
import { describe, expect, it } from "vitest";
import { InvitationId, RegistrationId } from "../domain/identity";
import { CommerceAccountError } from "./commerce-account";
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
  RegistrationAlreadyExists,
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
    expect(new CommerceAccountError({ message: "commerce down" }).message).toBe(
      "commerce down"
    );
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
        message: "Failed to update registration registration-1: store down",
        registrationId,
        operation: "update",
        cause: new Error("store down"),
      }).message
    ).toBe("Failed to update registration registration-1: store down");

    expect(
      new InvitationProviderFailure({
        message: "Failed to issue invitation: provider down",
        operation: "issue",
        cause: new Error("provider down"),
      }).message
    ).toBe("Failed to issue invitation: provider down");

    expect(
      new RegistrationEmailFailure({
        message: "Failed to send registrant_approved email: resend down",
        notification: "registrant_approved",
        cause: "resend down",
      }).message
    ).toBe("Failed to send registrant_approved email: resend down");

    expect(
      new EmailProviderFailure({
        message: "Failed to send email: [object Object]",
        operation: "send",
        cause: { status: 500 },
      }).message
    ).toBe("Failed to send email: [object Object]");

    expect(
      new RegistrationQueryFailure({
        message: "Failed to list registrations: query failed",
        operation: "list",
        cause: new Error("query failed"),
      }).message
    ).toBe("Failed to list registrations: query failed");

    expect(
      new StoreError({
        message: "Failed to read store value registration-1: decode failed",
        key: "registration-1",
        operation: "read",
        cause: new Error("decode failed"),
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
        message: "Registration for invitation invitation-1 was not found",
        invitationId,
      }).message
    ).toBe("Registration for invitation invitation-1 was not found");
    expect(
      new RegistrationTransitionConflict({
        message:
          "Cannot mark registration registration-1 as approved from rejected",
        registrationId,
        currentState: "rejected",
        attemptedDecision: "approved",
      }).message
    ).toBe("Cannot mark registration registration-1 as approved from rejected");
    expect(
      new RegistrationConcurrentModification({
        message: "Registration registration-1 was modified concurrently",
        registrationId,
      }).message
    ).toBe("Registration registration-1 was modified concurrently");
    expect(
      new RegistrationAlreadyExists({
        message: "Registration registration-1 already exists",
        registrationId,
      }).message
    ).toBe("Registration registration-1 already exists");
    expect(
      new InvitationNotFound({
        message: "Invitation invitation-1 was not found",
        invitationId,
      }).message
    ).toBe("Invitation invitation-1 was not found");
    expect(
      new RegistrationQueryInvalidCursor({
        message: "Invalid registration query cursor for list: bad-cursor",
        operation: "list",
        cursor: "bad-cursor",
      }).message
    ).toBe("Invalid registration query cursor for list: bad-cursor");
    expect(
      new StoreConflict({
        message: "Store update conflict for registration-1: version mismatch",
        key: "registration-1",
        operation: "update",
      }).message
    ).toBe("Store update conflict for registration-1: version mismatch");
  });
});
