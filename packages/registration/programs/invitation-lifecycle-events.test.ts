import { describe, expect, it } from "@effect/vitest";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { StoreKey } from "@repo/commerce/store";
import { Effect, Layer, Redacted } from "effect";

import { CompanyActor } from "../domain/actors";
import {
  AddressLine,
  AuthUserId,
  City,
  CompanyMemberInvitationId,
  CompanyName,
  CommerceBusinessUnitId,
  CountryCode,
  Email,
  InvitationId,
  PersonName,
  PostalCode,
} from "../domain/identity";
import {
  CompanyMemberIntent,
  PendingCompanyMemberInvitation,
} from "../domain/invitations";
import { CompanyMemberIdentityProjection } from "../services/company-member-identity-projection";
import { CompanyMemberInvitationRecords } from "../services/company-member-invitation-records";
import { RegistrationQueries } from "../services/registration-queries";
import { RegistrationWorkflow } from "../services/registration-workflow";
import { Registrations } from "../services/registrations";
import { dispatchInvitationLifecycleEvent } from "./invitation-lifecycle-events";

const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");
const companyMemberInvitationId = CompanyMemberInvitationId.make(
  "company-member-invitation-1"
);
const providerInvitationId = InvitationId.make("provider-invitation-1");
const inviteeEmail = Redacted.make(Email.make("member@example.com"), {
  label: "email",
});
const inviteeName = {
  firstName: Redacted.make(PersonName.make("Invitation"), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make("Default"), {
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

const layer = Layer.mergeAll(
  CompanyMemberInvitationRecords.layerMemory,
  Layer.succeed(CompanyMemberIdentityProjection, {
    projectAcceptedInvitation: () => Effect.void,
    projectMembership: () => Effect.void,
    removeMembership: () => Effect.void,
  }),
  CommerceAccounts.layerMemory,
  RegistrationQueries.layerMemoryFrom([]),
  Registrations.layerMemory,
  Layer.succeed(RegistrationWorkflow, {
    resumeInvitation: () => Effect.void,
    resumeReview: () => Effect.void,
    start: () => Effect.void,
  })
);

const prepareInvitation = Effect.gen(function* () {
  const accounts = yield* CommerceAccounts;
  const account = yield* accounts.createFromRegistration({
    _tag: "ApprovedRegistration",
    details: {
      address: {
        city: Redacted.make(City.make("London"), { label: "city" }),
        country: CountryCode.make("GB"),
        postalCode: Redacted.make(PostalCode.make("SW1A 1AA"), {
          label: "postalCode",
        }),
        streetName: Redacted.make(AddressLine.make("1 Example Street"), {
          label: "addressLine",
        }),
      },
      companyName: CompanyName.make("Example Company"),
      contactFirstName: Redacted.make(PersonName.make("Admin"), {
        label: "personName",
      }),
      contactLastName: Redacted.make(PersonName.make("User"), {
        label: "personName",
      }),
      email: administrator.email,
    },
    id: "registration-1",
    storeKey: StoreKey.make("default-store"),
  });
  const records = yield* CompanyMemberInvitationRecords;
  yield* records.recordIssued(
    new PendingCompanyMemberInvitation({
      _tag: "PendingInvitation",
      createdAt: new Date(0),
      expiresAt: new Date(60_000),
      id: providerInvitationId,
      intent: new CompanyMemberIntent({
        businessUnitId: account.businessUnitId,
        companyMemberInvitationId,
        intent: "company_member",
        inviteeEmail,
        inviteeName,
        roles: ["buyer", "approver"],
      }),
      issuedBy: administrator,
    })
  );

  return account.businessUnitId;
});

describe("invitation lifecycle events", () => {
  it.effect("persists WorkOS company-member revocation idempotently", () =>
    Effect.gen(function* () {
      yield* prepareInvitation;
      const input = {
        event: {
          event: "revoked" as const,
          revokedAt: new Date(30_000),
        },
        invitationId: providerInvitationId,
      };

      yield* dispatchInvitationLifecycleEvent(input);
      yield* dispatchInvitationLifecycleEvent(input);

      const records = yield* CompanyMemberInvitationRecords;
      const invitation = yield* records.getById(companyMemberInvitationId);
      expect(invitation).toMatchObject({
        _tag: "RevokedInvitation",
        revokedAt: new Date(30_000),
      });
    }).pipe(Effect.provide(layer))
  );

  it.effect(
    "provisions the invited customer from accepted event evidence",
    () =>
      Effect.gen(function* () {
        const invitationBusinessUnitId = yield* prepareInvitation;

        const membership = yield* dispatchInvitationLifecycleEvent({
          event: {
            acceptedAt: new Date(59_000),
            acceptedIdentity: {
              authUserId: AuthUserId.make("auth-member-1"),
              email: Email.make("member@example.com"),
            },
            event: "accepted",
          },
          invitationId: providerInvitationId,
        });

        expect(membership).toMatchObject({
          authUserId: "auth-member-1",
          businessUnitId: invitationBusinessUnitId,
          roles: ["buyer", "approver"],
        });
        const records = yield* CompanyMemberInvitationRecords;
        const accepted = yield* records.getById(companyMemberInvitationId);
        expect(accepted._tag).toBe("AcceptedInvitation");
        if (accepted._tag === "AcceptedInvitation") {
          expect(Redacted.value(accepted.acceptedBy.firstName)).toBe(
            "Invitation"
          );
          expect(Redacted.value(accepted.acceptedBy.lastName)).toBe("Default");
        }
      }).pipe(Effect.provide(layer))
  );
});
