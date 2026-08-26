import { describe, expect, it } from "@effect/vitest";
import { CommerceBusinessUnitId } from "@repo/commerce/domain/commerce-account";
import type { CompanyRoles } from "@repo/commerce/domain/commerce-account";
import { AuthUserId as CommerceAuthUserId } from "@repo/commerce/domain/commerce-request-context";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import {
  CustomerAccountCompanyActor,
  CustomerAccountMembers,
  InvitationPolicyError as CustomerAccountInvitationPolicyError,
  InvitationProviderFailure,
} from "@repo/commerce/services/customer-account-members";
import { DateTime, Effect, Layer, Redacted, Ref } from "effect";

import { InvitationId } from "../domain/identity";
import { PendingInvitation } from "../domain/invitations";
import { CompanyInvitationPolicy } from "./company-invitation-policy";
import { CompanyMemberInvitationRecords } from "./company-member-invitation-records";
import { customerAccountMembersLayer } from "./customer-account-members";
import type { CompanyMemberInvitationIssueInput } from "./invitations";
import { CompanyMemberInvitations } from "./invitations";

const actor = (roles: CompanyRoles) => {
  const isAdministrator = roles.some((role) => role === "admin");

  return new CustomerAccountCompanyActor({
    authUserId: CommerceAuthUserId.make(
      isAdministrator ? "auth-admin-1" : "auth-buyer-1"
    ),
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    email: Redacted.make(
      isAdministrator ? "admin@example.com" : "buyer@example.com",
      { label: "email" }
    ),
    roles,
  });
};

const provideAdapter = (providerLayer: Layer.Layer<CompanyMemberInvitations>) =>
  customerAccountMembersLayer.pipe(
    Layer.provide(
      Layer.mergeAll(
        providerLayer,
        CompanyInvitationPolicy.layer,
        CompanyMemberInvitationRecords.layerMemory,
        CommerceAccounts.layerMemory
      )
    )
  );

const inviteeName = {
  firstName: Redacted.make("Invited", { label: "personName" }),
  lastName: Redacted.make("Member", { label: "personName" }),
};

describe("customer account members adapter", () => {
  it.effect("maps a verified administrator invitation into Registration", () =>
    Effect.gen(function* () {
      const captured = yield* Ref.make<
        CompanyMemberInvitationIssueInput | undefined
      >(undefined);
      const providerLayer = Layer.succeed(CompanyMemberInvitations)({
        issue: (input) =>
          Ref.set(captured, input).pipe(
            Effect.as(
              new PendingInvitation({
                _tag: "PendingInvitation",
                createdAt: DateTime.toDateUtc(
                  DateTime.makeUnsafe("2026-08-25T12:00:00.000Z")
                ),
                expiresAt: DateTime.toDateUtc(
                  DateTime.makeUnsafe("2026-09-25T12:00:00.000Z")
                ),
                id: InvitationId.make("invitation-1"),
                intent: input.intent,
                issuedBy: input.issuedBy,
              })
            )
          ),
        revoke: () => Effect.die("not used in this test"),
      });

      const receipt = yield* Effect.gen(function* () {
        const members = yield* CustomerAccountMembers;
        return yield* members.invite({
          actor: actor(["admin", "buyer"]),
          inviteeEmail: Redacted.make("member@example.com", {
            label: "email",
          }),
          inviteeName,
          roles: ["buyer", "approver"],
        });
      }).pipe(Effect.provide(provideAdapter(providerLayer)));
      const providerInput = yield* Ref.get(captured).pipe(
        Effect.flatMap((input) =>
          input === undefined
            ? Effect.die("Expected the provider to receive an invite")
            : Effect.succeed(input)
        )
      );

      expect({
        invitationId: receipt.invitationId,
        inviteeEmail: Redacted.value(receipt.inviteeEmail),
      }).toStrictEqual({
        invitationId: "invitation-1",
        inviteeEmail: "member@example.com",
      });
      expect(providerInput.issuedBy).toMatchObject({
        actorType: "company",
        authUserId: "auth-admin-1",
        businessUnitId: "business-unit-1",
        roles: ["admin", "buyer"],
      });
      expect(providerInput.intent).toMatchObject({
        businessUnitId: "business-unit-1",
        intent: "company_member",
        roles: ["buyer", "approver"],
      });
      expect(Redacted.value(providerInput.intent.inviteeEmail)).toBe(
        "member@example.com"
      );
      expect({
        firstName: Redacted.value(providerInput.intent.inviteeName.firstName),
        lastName: Redacted.value(providerInput.intent.inviteeName.lastName),
      }).toStrictEqual({ firstName: "Invited", lastName: "Member" });
    })
  );

  it.effect("enforces the injected policy before calling the provider", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0);
      const providerLayer = Layer.succeed(CompanyMemberInvitations)({
        issue: () =>
          Ref.update(calls, (count) => count + 1).pipe(
            Effect.andThen(Effect.die("not expected"))
          ),
        revoke: () => Effect.die("not used in this test"),
      });

      const failure = yield* Effect.gen(function* () {
        const members = yield* CustomerAccountMembers;
        return yield* members.invite({
          actor: actor(["buyer"]),
          inviteeEmail: Redacted.make("invitee@example.com", {
            label: "email",
          }),
          inviteeName,
          roles: ["buyer"],
        });
      }).pipe(Effect.provide(provideAdapter(providerLayer)), Effect.flip);

      expect(failure).toBeInstanceOf(CustomerAccountInvitationPolicyError);
      expect(failure._tag).toBe("InvitationPolicyError");
      expect(yield* Ref.get(calls)).toBe(0);
    })
  );

  it.effect("passes provider delivery failures through unchanged", () => {
    const providerFailure = new InvitationProviderFailure({
      cause: new Error("provider unavailable"),
      message: "Invitation delivery is unavailable",
      operation: "issue",
    });
    const providerLayer = Layer.succeed(CompanyMemberInvitations)({
      issue: () => Effect.fail(providerFailure),
      revoke: () => Effect.die("not used in this test"),
    });

    return Effect.gen(function* () {
      const members = yield* CustomerAccountMembers;
      const failure = yield* members
        .invite({
          actor: actor(["admin", "buyer"]),
          inviteeEmail: Redacted.make("member@example.com", {
            label: "email",
          }),
          inviteeName,
          roles: ["buyer"],
        })
        .pipe(Effect.flip);

      expect(failure).toBe(providerFailure);
    }).pipe(Effect.provide(provideAdapter(providerLayer)));
  });
});
