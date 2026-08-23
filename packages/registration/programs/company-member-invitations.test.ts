import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Redacted } from "effect";

import { CompanyActor } from "../domain/actors";
import {
  AcceptedAuthIdentity,
  AuthUserId,
  CommerceBusinessUnitId,
  Email,
  PersonName,
} from "../domain/identity";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import { invitationCapabilitiesLayerMemory } from "../services/invitations";
import {
  acceptCompanyMemberInvitation,
  CompanyMemberInvitationContextUnavailable,
  issueCompanyMemberInvite,
  revokeCompanyMemberInvite,
} from "./company-member-invitations";

const layerMemory = Layer.mergeAll(
  invitationCapabilitiesLayerMemory,
  CompanyInvitationPolicy.layer
);

const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");
const inviteeEmail = Redacted.make(Email.make("associate@example.com"), {
  label: "email",
});

const owner = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-owner-1"),
  businessUnitId,
  email: Redacted.make(Email.make("owner@example.com"), { label: "email" }),
  role: "owner",
});

const associate = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-associate-1"),
  businessUnitId,
  email: Redacted.make(Email.make("existing-associate@example.com"), {
    label: "email",
  }),
  role: "associate",
});

const acceptedIdentity = new AcceptedAuthIdentity({
  authUserId: AuthUserId.make("auth-invitee-1"),
  email: inviteeEmail,
  firstName: Redacted.make(PersonName.make("Invited"), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make("Associate"), {
    label: "personName",
  }),
});

describe("company member invitations", () => {
  it.effect("allows an owner to issue an associate invitation", () =>
    Effect.gen(function* () {
      const invitation = yield* issueCompanyMemberInvite({
        actor: owner,
        inviteeEmail,
        role: "associate",
      });

      expect(invitation).toMatchObject({
        _tag: "PendingInvitation",
        issuedBy: owner,
      });
      expect(invitation.intent.intent).toBe("company_member");
      if (invitation.intent.intent !== "company_member") {
        throw new Error("Expected a company member invitation");
      }
      expect(invitation.intent.businessUnitId).toBe(businessUnitId);
      expect(Redacted.value(invitation.intent.inviteeEmail)).toBe(
        Redacted.value(inviteeEmail)
      );
      expect(invitation.intent.role).toBe("associate");
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects associates attempting to issue invitations", () =>
    Effect.gen(function* () {
      const exit = yield* issueCompanyMemberInvite({
        actor: associate,
        inviteeEmail,
        role: "associate",
      }).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("InvitationPolicyError");
      }
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "returns the existing pending invitation for duplicate associate invites",
    () =>
      Effect.gen(function* () {
        const first = yield* issueCompanyMemberInvite({
          actor: owner,
          inviteeEmail,
          role: "associate",
        });
        const second = yield* issueCompanyMemberInvite({
          actor: owner,
          inviteeEmail,
          role: "associate",
        });

        expect(second.id).toBe(first.id);
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "keeps company-member revocation deferred without trusted context",
    () =>
      Effect.gen(function* () {
        const invitation = yield* issueCompanyMemberInvite({
          actor: owner,
          inviteeEmail,
          role: "associate",
        });

        const failure = yield* revokeCompanyMemberInvite({
          actor: owner,
          invitationId: invitation.id,
        }).pipe(Effect.flip);

        expect(failure).toBeInstanceOf(
          CompanyMemberInvitationContextUnavailable
        );
        if (failure._tag === "CompanyMemberInvitationContextUnavailable") {
          expect(failure.invitationId).toBe(invitation.id);
        }
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("authorizes revocation before reporting deferred context", () =>
    Effect.gen(function* () {
      const invitation = yield* issueCompanyMemberInvite({
        actor: owner,
        inviteeEmail,
        role: "associate",
      });

      const exit = yield* revokeCompanyMemberInvite({
        actor: associate,
        invitationId: invitation.id,
      }).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("InvitationPolicyError");
      }
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "keeps company-member acceptance deferred without trusted context",
    () =>
      Effect.gen(function* () {
        const invitation = yield* issueCompanyMemberInvite({
          actor: owner,
          inviteeEmail,
          role: "associate",
        });

        const failure = yield* acceptCompanyMemberInvitation({
          acceptedIdentity,
          invitationId: invitation.id,
        }).pipe(Effect.flip);

        expect(failure).toBeInstanceOf(
          CompanyMemberInvitationContextUnavailable
        );
        expect(failure.invitationId).toBe(invitation.id);
      }).pipe(Effect.provide(layerMemory))
  );
});
