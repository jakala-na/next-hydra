import { describe, expect, it } from "@effect/vitest";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { Effect, Exit, Layer, Redacted } from "effect";

import { CompanyActor } from "../domain/actors";
import {
  AuthUserId,
  CommerceBusinessUnitId,
  Email,
  PersonName,
} from "../domain/identity";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import { CompanyMemberInvitationRecords } from "../services/company-member-invitation-records";
import {
  InvitationDeliveries,
  invitationCapabilitiesLayerMemory,
} from "../services/invitations";
import {
  issueCompanyMemberInvite,
  revokeCompanyMemberInvite,
} from "./company-member-invitations";

const layerMemory = Layer.mergeAll(
  invitationCapabilitiesLayerMemory,
  CompanyInvitationPolicy.layer,
  CompanyMemberInvitationRecords.layerMemory,
  CommerceAccounts.layerMemory
);

const existingCustomerLayer = Layer.effect(
  CommerceAccounts,
  CommerceAccounts.pipe(
    Effect.map((accounts) =>
      CommerceAccounts.of({
        ...accounts,
        hasCustomerWithEmail: () => Effect.succeed(true),
      })
    )
  )
).pipe(Layer.provide(CommerceAccounts.layerMemory));

const existingCustomerInvitationLayer = Layer.mergeAll(
  invitationCapabilitiesLayerMemory,
  CompanyInvitationPolicy.layer,
  CompanyMemberInvitationRecords.layerMemory,
  existingCustomerLayer
);

const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");
const inviteeEmail = Redacted.make(Email.make("member@example.com"), {
  label: "email",
});
const inviteeName = {
  firstName: Redacted.make(PersonName.make("Invited"), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make("Member"), {
    label: "personName",
  }),
};

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
        inviteeName,
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
        inviteeName,
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
        inviteeName,
        roles: ["buyer"],
      }).pipe(Effect.flip);

      expect(failure._tag).toBe("InvitationConflict");
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "rejects an existing Commerce customer before provider issuance",
    () =>
      Effect.gen(function* () {
        const failure = yield* issueCompanyMemberInvite({
          actor: administrator,
          inviteeEmail,
          inviteeName,
          roles: ["buyer"],
        }).pipe(Effect.flip);

        expect(failure._tag).toBe("InvitationConflict");
        expect(failure.message).toContain("Commerce customer already exists");
      }).pipe(Effect.provide(existingCustomerInvitationLayer))
  );

  it.effect("rejects a duplicate invitation with the same role set", () =>
    Effect.gen(function* () {
      yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["buyer", "approver"],
      });
      const failure = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
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
        inviteeName,
        roles: ["buyer"],
      });

      const failure = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["approver"],
      }).pipe(Effect.flip);

      expect(failure._tag).toBe("InvitationConflict");
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "revokes the provider delivery and durable invitation idempotently",
    () =>
      Effect.gen(function* () {
        const issued = yield* issueCompanyMemberInvite({
          actor: administrator,
          inviteeEmail,
          inviteeName,
          roles: ["buyer"],
        });
        const input = {
          actor: administrator,
          companyMemberInvitationId: issued.intent.companyMemberInvitationId,
        };

        const first = yield* revokeCompanyMemberInvite(input);
        const replay = yield* revokeCompanyMemberInvite(input);
        const delivery = yield* InvitationDeliveries.pipe(
          Effect.flatMap((invitations) => invitations.get(issued.id))
        );

        expect(first._tag).toBe("RevokedInvitation");
        expect(replay).toStrictEqual(first);
        expect(delivery.status).toBe("revoked");
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects revocation by a non-administrator", () =>
    Effect.gen(function* () {
      const issued = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["buyer"],
      });

      const failure = yield* revokeCompanyMemberInvite({
        actor: buyer,
        companyMemberInvitationId: issued.intent.companyMemberInvitationId,
      }).pipe(Effect.flip);
      const records = yield* CompanyMemberInvitationRecords;
      const durable = yield* records.getById(
        issued.intent.companyMemberInvitationId
      );

      expect(failure._tag).toBe("InvitationPolicyError");
      expect(durable._tag).toBe("PendingInvitation");
    }).pipe(Effect.provide(layerMemory))
  );
});
