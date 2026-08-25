import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Redacted } from "effect";

import { CompanyActor } from "../domain/actors";
import { AuthUserId, CommerceBusinessUnitId, Email } from "../domain/identity";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import { invitationCapabilitiesLayerMemory } from "../services/invitations";
import { issueCompanyMemberInvite } from "./company-member-invitations";

const layerMemory = Layer.mergeAll(
  invitationCapabilitiesLayerMemory,
  CompanyInvitationPolicy.layer
);

const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");
const inviteeEmail = Redacted.make(Email.make("member@example.com"), {
  label: "email",
});

const administrator = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-admin-1"),
  businessUnitId,
  email: Redacted.make(Email.make("admin@example.com"), { label: "email" }),
  roles: ["admin", "buyer"],
});

const buyer = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-buyer-1"),
  businessUnitId,
  email: Redacted.make(Email.make("existing-member@example.com"), {
    label: "email",
  }),
  roles: ["buyer"],
});

describe("company member invitations", () => {
  it.effect("allows an administrator to issue a multi-role invitation", () =>
    Effect.gen(function* () {
      const invitation = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        roles: ["buyer", "approver"],
      });

      expect(invitation).toMatchObject({
        _tag: "PendingInvitation",
        issuedBy: administrator,
      });
      expect(invitation.intent.intent).toBe("company_member");
      if (invitation.intent.intent !== "company_member") {
        throw new Error("Expected a company member invitation");
      }
      expect(invitation.intent.businessUnitId).toBe(businessUnitId);
      expect(Redacted.value(invitation.intent.inviteeEmail)).toBe(
        Redacted.value(inviteeEmail)
      );
      expect(invitation.intent.roles).toStrictEqual(["buyer", "approver"]);
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects non-administrators attempting to issue invitations", () =>
    Effect.gen(function* () {
      const exit = yield* issueCompanyMemberInvite({
        actor: buyer,
        inviteeEmail,
        roles: ["buyer"],
      }).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("InvitationPolicyError");
      }
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects invitations to the administrator's own email", () =>
    Effect.gen(function* () {
      const failure = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail: Redacted.make(Email.make("ADMIN@example.com"), {
          label: "email",
        }),
        roles: ["buyer"],
      }).pipe(Effect.flip);

      expect(failure._tag).toBe("InvitationConflict");
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects a duplicate invitation with the same role set", () =>
    Effect.gen(function* () {
      yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        roles: ["buyer", "approver"],
      });
      const failure = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        roles: ["approver", "buyer"],
      }).pipe(Effect.flip);

      expect(failure._tag).toBe("InvitationConflict");
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects a duplicate invitation with a different role set", () =>
    Effect.gen(function* () {
      yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        roles: ["buyer"],
      });

      const failure = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        roles: ["approver"],
      }).pipe(Effect.flip);

      expect(failure._tag).toBe("InvitationConflict");
    }).pipe(Effect.provide(layerMemory))
  );
});
