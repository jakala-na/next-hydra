import { describe, expect, it } from "@effect/vitest";
import {
  CommerceAccount,
  CommerceAssociateMembership,
} from "@repo/commerce/domain/commerce-account";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { Effect, Exit, Layer, Redacted } from "effect";

import { CompanyActor } from "../domain/actors";
import {
  AcceptedAuthIdentity,
  AuthUserId,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  Email,
  PersonName,
  RegistrationId,
} from "../domain/identity";
import { RegistrationApprovalIntent } from "../domain/invitations";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import { Invitations } from "../services/invitations";
import {
  acceptCompanyMemberInvitation,
  issueCompanyMemberInvite,
  revokeCompanyMemberInvite,
} from "./company-member-invitations";

const acceptedMemberships: CommerceAssociateMembership[] = [];

const commerceAccount = new CommerceAccount({
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  customerId: CommerceCustomerId.make("customer-1"),
  registrationId: RegistrationId.make("registration-1"),
});

const commerceAccountsLayer = Layer.succeed(CommerceAccounts, {
  addAssociate: (input) =>
    Effect.sync(() => {
      const alreadyAccepted = acceptedMemberships.some(
        (acceptedMembership) =>
          acceptedMembership.businessUnitId === input.businessUnitId &&
          acceptedMembership.authUserId === input.acceptedIdentity.authUserId
      );
      if (alreadyAccepted) {
        const existingMembership = acceptedMemberships.find(
          (acceptedMembership) =>
            acceptedMembership.businessUnitId === input.businessUnitId &&
            acceptedMembership.authUserId === input.acceptedIdentity.authUserId
        );
        if (existingMembership) {
          return existingMembership;
        }
      }

      const membership = new CommerceAssociateMembership({
        authUserId: input.acceptedIdentity.authUserId,
        businessUnitId: input.businessUnitId,
        customerId: CommerceCustomerId.make(
          `customer-${input.acceptedIdentity.authUserId}`
        ),
        role: input.role,
      });
      acceptedMemberships.push(membership);
      return membership;
    }),
  createFromRegistration: () => Effect.succeed(commerceAccount),
  getCustomerIdByAuthUserId: () => Effect.die("not used"),
  getCustomerProfile: () => Effect.die("not used"),
  hasCustomerWithEmail: () => Effect.succeed(false),
  linkRegistrantIdentity: () => Effect.succeed(commerceAccount),
  listBusinessUnitMembershipsForCustomerInStore: () => Effect.die("not used"),
});

const layerMemory = Layer.mergeAll(
  Invitations.layerMemory,
  CompanyInvitationPolicy.layer,
  commerceAccountsLayer
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

      expect(invitation._tag).toBe("PendingInvitation");
      expect(invitation.issuedBy).toBe(owner);
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

  it.effect("revokes pending invitations when authorized", () =>
    Effect.gen(function* () {
      const invitation = yield* issueCompanyMemberInvite({
        actor: owner,
        inviteeEmail,
        role: "associate",
      });

      const revoked = yield* revokeCompanyMemberInvite({
        actor: owner,
        invitationId: invitation.id,
      });

      expect(revoked._tag).toBe("RevokedInvitation");
      expect(revoked.revokedBy).toBe(owner);
      expect(revoked.id).toBe(invitation.id);
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects associates attempting to revoke invitations", () =>
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

  it.effect("rejects revocation of accepted company invitations", () =>
    Effect.gen(function* () {
      const invitation = yield* issueCompanyMemberInvite({
        actor: owner,
        inviteeEmail,
        role: "associate",
      });
      yield* acceptCompanyMemberInvitation({
        acceptedIdentity,
        invitationId: invitation.id,
      });

      const exit = yield* revokeCompanyMemberInvite({
        actor: owner,
        invitationId: invitation.id,
      }).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "accepts company invitations idempotently for the same auth user",
    () =>
      Effect.gen(function* () {
        const acceptedMembershipCount = acceptedMemberships.length;
        const retryIdentity = new AcceptedAuthIdentity({
          authUserId: AuthUserId.make("auth-invitee-retry"),
          email: inviteeEmail,
          firstName: Redacted.make(PersonName.make("Retry"), {
            label: "personName",
          }),
          lastName: Redacted.make(PersonName.make("Associate"), {
            label: "personName",
          }),
        });
        const invitation = yield* issueCompanyMemberInvite({
          actor: owner,
          inviteeEmail,
          role: "associate",
        });

        const first = yield* acceptCompanyMemberInvitation({
          acceptedIdentity: retryIdentity,
          invitationId: invitation.id,
        });
        const second = yield* acceptCompanyMemberInvitation({
          acceptedIdentity: retryIdentity,
          invitationId: invitation.id,
        });

        expect(first._tag).toBe("AcceptedInvitation");
        expect(second.id).toBe(first.id);
        expect(second.acceptedBy.authUserId).toBe(retryIdentity.authUserId);
        expect(acceptedMemberships).toHaveLength(acceptedMembershipCount + 1);
        expect(acceptedMemberships.at(-1)).toMatchObject({
          authUserId: retryIdentity.authUserId,
          businessUnitId,
          customerId: CommerceCustomerId.make(
            `customer-${retryIdentity.authUserId}`
          ),
          role: "associate",
        });
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "fails company invitation acceptance by a different auth user",
    () =>
      Effect.gen(function* () {
        const invitation = yield* issueCompanyMemberInvite({
          actor: owner,
          inviteeEmail,
          role: "associate",
        });
        yield* acceptCompanyMemberInvitation({
          acceptedIdentity,
          invitationId: invitation.id,
        });

        const differentIdentity = new AcceptedAuthIdentity({
          authUserId: AuthUserId.make("auth-invitee-2"),
          email: inviteeEmail,
          firstName: Redacted.make(PersonName.make("Invited"), {
            label: "personName",
          }),
          lastName: Redacted.make(PersonName.make("Associate"), {
            label: "personName",
          }),
        });

        const exit = yield* acceptCompanyMemberInvitation({
          acceptedIdentity: differentIdentity,
          invitationId: invitation.id,
        }).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "does not accept registration invitations through the company member program",
    () =>
      Effect.gen(function* () {
        const invitations = yield* Invitations;
        const registrationInvitation = yield* invitations.issue({
          intent: new RegistrationApprovalIntent({
            intent: "registration_approval",
            inviteeEmail,
            registrationId: RegistrationId.make("registration-1"),
            role: "owner",
          }),
          issuedBy: owner,
        });

        const wrongProgramExit = yield* acceptCompanyMemberInvitation({
          acceptedIdentity,
          invitationId: registrationInvitation.id,
        }).pipe(Effect.exit);

        expect(Exit.isFailure(wrongProgramExit)).toBeTruthy();

        const accepted = yield* invitations.accept({
          acceptedIdentity,
          expectedIntent: "registration_approval",
          invitationId: registrationInvitation.id,
        });

        expect(accepted._tag).toBe("AcceptedInvitation");
        expect(accepted.intent.intent).toBe("registration_approval");
      }).pipe(Effect.provide(layerMemory))
  );
});
