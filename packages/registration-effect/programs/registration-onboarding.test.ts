import { describe, expect, it } from "@effect/vitest";
import {
  CommerceAccount,
  CommerceAssociateMembership,
} from "@repo/commerce/domain/commerce-account";
import {
  type AcceptedCommerceIdentity,
  CommerceAccountError,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import { Effect, Exit, Layer, Redacted } from "effect";
import { RegistrationReviewerActor } from "../domain/actors";
import {
  AcceptedAuthIdentity,
  AddressLine,
  AuthUserId,
  City,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  CompanyName,
  CountryCode,
  Email,
  InvitationId,
  PersonName,
  PhoneNumber,
  PostalCode,
  Region,
  VatId,
} from "../domain/identity";
import { CompanyMemberIntent, PendingInvitation } from "../domain/invitations";
import {
  CompanyAddress,
  CompanyRegistrationDetails,
} from "../domain/registration";
import {
  InvitationConflict,
  InvitationNotFound,
  Invitations,
  type IssueInvitationInput,
} from "../services/invitations";
import {
  Registrations,
  RegistrationTransitionConflict,
} from "../services/registrations";
import {
  acceptRegistrationInvitation,
  approveRegistration,
  rejectRegistration,
} from "./registration-onboarding";

const layerMemory = Layer.mergeAll(
  Registrations.layerMemory,
  CommerceAccounts.layerMemory,
  Invitations.layerMemory
);

const reviewer = new RegistrationReviewerActor({
  actorType: "registration_reviewer",
  authUserId: AuthUserId.make("auth-reviewer-1"),
  email: Redacted.make(Email.make("reviewer@example.com"), {
    label: "email",
  }),
  name: "Registration Reviewer",
});

const details = new CompanyRegistrationDetails({
  companyName: CompanyName.make("Hydra Supplies"),
  companyPhone: Redacted.make(PhoneNumber.make("+1 555 0100"), {
    label: "companyPhone",
  }),
  vatId: Redacted.make(VatId.make("VAT-123"), { label: "vatId" }),
  contactFirstName: Redacted.make(PersonName.make("Ada"), {
    label: "personName",
  }),
  contactLastName: Redacted.make(PersonName.make("Lovelace"), {
    label: "personName",
  }),
  email: Redacted.make(Email.make("ada@example.com"), { label: "email" }),
  address: new CompanyAddress({
    streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
      label: "addressLine",
    }),
    additionalStreetInfo: Redacted.make(AddressLine.make("Suite 42"), {
      label: "addressLine",
    }),
    postalCode: Redacted.make(PostalCode.make("10001"), {
      label: "postalCode",
    }),
    city: Redacted.make(City.make("New York"), { label: "city" }),
    region: Redacted.make(Region.make("NY"), { label: "region" }),
    country: CountryCode.make("US"),
  }),
});

const acceptedIdentity = new AcceptedAuthIdentity({
  authUserId: AuthUserId.make("auth-user-1"),
  email: Redacted.make(Email.make("ada@example.com"), { label: "email" }),
  firstName: Redacted.make(PersonName.make("Ada"), { label: "personName" }),
  lastName: Redacted.make(PersonName.make("Lovelace"), {
    label: "personName",
  }),
});

const createRegistration = Effect.gen(function* () {
  const registrations = yield* Registrations;
  return yield* registrations.createAwaitingApproval({ details });
});

describe("registration onboarding", () => {
  it.effect(
    "approves a registration by provisioning commerce and issuing an owner invitation",
    () =>
      Effect.gen(function* () {
        const registration = yield* createRegistration;

        const approved = yield* approveRegistration({
          registrationId: registration.id,
          actor: reviewer,
          reason: "Looks good",
        });
        const invitations = yield* Invitations;
        const invitation = yield* invitations.get(approved.invitationId);

        expect(approved._tag).toBe("ApprovedRegistration");
        expect(approved.decision.decision).toBe("approved");
        expect(approved.commerceAccount.registrationId).toBe(registration.id);
        expect(invitation._tag).toBe("PendingInvitation");
        expect(invitation.intent.intent).toBe("provider_managed");
        expect(String(approved.details.vatId)).toBe("<redacted:vatId>");
        expect(String(approved.details.email)).toBe("<redacted:email>");
        expect(String(approved.details.address.streetName)).toBe(
          "<redacted:addressLine>"
        );
        expect(String(approved.details.address.postalCode)).toBe(
          "<redacted:postalCode>"
        );
        expect(String(invitation.intent.inviteeEmail)).toBe("<redacted:email>");
        expect(invitation.intent.role).toBe("owner");
        expect(invitation.issuedBy.actorType).toBe("system");
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("approval retries return the existing approved registration", () =>
    Effect.gen(function* () {
      const registration = yield* createRegistration;

      const first = yield* approveRegistration({
        registrationId: registration.id,
        actor: reviewer,
      });
      const second = yield* approveRegistration({
        registrationId: registration.id,
        actor: reviewer,
      });

      expect(second.commerceAccount.customerId).toBe(
        first.commerceAccount.customerId
      );
      expect(second.invitationId).toBe(first.invitationId);
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "rejects a registration without creating commerce or invitations",
    () =>
      Effect.gen(function* () {
        const registration = yield* createRegistration;

        const rejected = yield* rejectRegistration({
          registrationId: registration.id,
          actor: reviewer,
          reason: "Not eligible",
        });

        expect(rejected._tag).toBe("RejectedRegistration");
        expect(rejected.decision.decision).toBe("rejected");

        const approveAfterReject = yield* approveRegistration({
          registrationId: registration.id,
          actor: reviewer,
        }).pipe(Effect.exit);

        expect(Exit.isFailure(approveAfterReject)).toBe(true);
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("fails incompatible repeated decisions with typed conflicts", () =>
    Effect.gen(function* () {
      const registration = yield* createRegistration;
      yield* approveRegistration({
        registrationId: registration.id,
        actor: reviewer,
      });

      const rejectedExit = yield* rejectRegistration({
        registrationId: registration.id,
        actor: reviewer,
      }).pipe(Effect.exit);

      expect(Exit.isFailure(rejectedExit)).toBe(true);
      if (Exit.isFailure(rejectedExit)) {
        expect(rejectedExit.cause.toString()).toContain(
          RegistrationTransitionConflict.name
        );
      }
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "leaves the registration awaiting approval when commerce provisioning fails",
    () => {
      const commerceFailureLayer = Layer.succeed(CommerceAccounts)({
        createFromRegistration: () =>
          Effect.fail(new CommerceAccountError({ message: "commerce down" })),
        linkRegistrantIdentity: () =>
          Effect.fail(new CommerceAccountError({ message: "commerce down" })),
        hasCustomerWithEmail: () =>
          Effect.fail(new CommerceAccountError({ message: "commerce down" })),
        addAssociate: () =>
          Effect.fail(new CommerceAccountError({ message: "commerce down" })),
      });
      const layer = Layer.mergeAll(
        Registrations.layerMemory,
        commerceFailureLayer,
        Invitations.layerMemory
      );

      return Effect.gen(function* () {
        const registration = yield* createRegistration;
        const exit = yield* approveRegistration({
          registrationId: registration.id,
          actor: reviewer,
        }).pipe(Effect.exit);
        const registrations = yield* Registrations;
        const current = yield* registrations.get(registration.id);

        expect(Exit.isFailure(exit)).toBe(true);
        expect(current._tag).toBe("AwaitingApprovalRegistration");
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    "reuses commerce state when invitation issuance fails and approval is retried",
    () => {
      let issueAttempts = 0;
      const flakyInvitationsLayer = Layer.succeed(Invitations)({
        issue: (input: IssueInvitationInput) =>
          Effect.suspend(() => {
            issueAttempts += 1;
            if (issueAttempts === 1) {
              return Effect.fail(
                new InvitationConflict({
                  message: "invitation provider down",
                })
              );
            }

            return Effect.succeed(
              new PendingInvitation({
                _tag: "PendingInvitation",
                id: InvitationId.make("invitation-retry"),
                intent: input.intent,
                issuedBy: input.issuedBy,
                createdAt: new Date(0),
              })
            );
          }),
        accept: () =>
          Effect.fail(
            new InvitationConflict({ message: "not used in this test" })
          ),
        get: () =>
          Effect.fail(
            new InvitationNotFound({
              message: "Invitation not-used was not found",
              invitationId: InvitationId.make("not-used"),
            })
          ),
        revoke: () =>
          Effect.fail(
            new InvitationConflict({ message: "not used in this test" })
          ),
      });
      const failingLayer = Layer.mergeAll(
        Registrations.layerMemory,
        CommerceAccounts.layerMemory,
        flakyInvitationsLayer
      );

      return Effect.gen(function* () {
        const registration = yield* createRegistration;
        const failed = yield* approveRegistration({
          registrationId: registration.id,
          actor: reviewer,
        }).pipe(Effect.exit);
        const registrations = yield* Registrations;
        const awaiting = yield* registrations.get(registration.id);

        expect(Exit.isFailure(failed)).toBe(true);
        expect(awaiting._tag).toBe("AwaitingApprovalRegistration");

        const approved = yield* approveRegistration({
          registrationId: registration.id,
          actor: reviewer,
        });

        expect(approved.commerceAccount.customerId).toBe(
          CommerceCustomerId.make(`customer-${registration.id}`)
        );
        expect(approved.invitationId).toBe(
          InvitationId.make("invitation-retry")
        );
      }).pipe(Effect.provide(failingLayer));
    }
  );

  it.effect(
    "accepts registration invitations idempotently for the same auth user",
    () =>
      Effect.gen(function* () {
        const registration = yield* createRegistration;
        const approved = yield* approveRegistration({
          registrationId: registration.id,
          actor: reviewer,
        });

        const first = yield* acceptRegistrationInvitation({
          registrationId: approved.id,
          invitationId: approved.invitationId,
          acceptedIdentity,
        });
        const second = yield* acceptRegistrationInvitation({
          registrationId: approved.id,
          invitationId: approved.invitationId,
          acceptedIdentity,
        });

        expect(first._tag).toBe("ApprovedRegistration");
        expect(second._tag).toBe("ApprovedRegistration");
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("adds the accepted registrant as the business unit owner", () => {
    const linkedIdentities: AcceptedCommerceIdentity[] = [];
    const commerceLayer = Layer.succeed(
      CommerceAccounts,
      CommerceAccounts.of({
        createFromRegistration: (registration) =>
          Effect.succeed(
            new CommerceAccount({
              registrationId: registration.id,
              customerId: CommerceCustomerId.make(
                `customer-${registration.id}`
              ),
              businessUnitId: CommerceBusinessUnitId.make(
                `business-unit-${registration.id}`
              ),
            })
          ),
        linkRegistrantIdentity: (input) =>
          Effect.sync(() => {
            linkedIdentities.push(input.acceptedIdentity);
            return input.registration.commerceAccount;
          }),
        hasCustomerWithEmail: () => Effect.succeed(false),
        addAssociate: (input) =>
          Effect.sync(() => {
            return new CommerceAssociateMembership({
              businessUnitId: input.businessUnitId,
              customerId: CommerceCustomerId.make(
                `customer-${input.acceptedIdentity.authUserId}`
              ),
              authUserId: input.acceptedIdentity.authUserId,
              role: input.role,
            });
          }),
      })
    );
    const layer = Layer.mergeAll(
      Registrations.layerMemory,
      commerceLayer,
      Invitations.layerMemory
    );

    return Effect.gen(function* () {
      const registration = yield* createRegistration;
      const approved = yield* approveRegistration({
        registrationId: registration.id,
        actor: reviewer,
      });

      yield* acceptRegistrationInvitation({
        registrationId: approved.id,
        invitationId: approved.invitationId,
        acceptedIdentity,
      });

      expect(linkedIdentities).toEqual([acceptedIdentity]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "fails registration invitation acceptance by a different auth user",
    () =>
      Effect.gen(function* () {
        const registration = yield* createRegistration;
        const approved = yield* approveRegistration({
          registrationId: registration.id,
          actor: reviewer,
        });

        yield* acceptRegistrationInvitation({
          registrationId: approved.id,
          invitationId: approved.invitationId,
          acceptedIdentity,
        });

        const differentIdentity = new AcceptedAuthIdentity({
          authUserId: AuthUserId.make("auth-user-2"),
          email: Redacted.make(Email.make("ada@example.com"), {
            label: "email",
          }),
          firstName: Redacted.make(PersonName.make("Ada"), {
            label: "personName",
          }),
          lastName: Redacted.make(PersonName.make("Lovelace"), {
            label: "personName",
          }),
        });

        const exit = yield* acceptRegistrationInvitation({
          registrationId: approved.id,
          invitationId: approved.invitationId,
          acceptedIdentity: differentIdentity,
        }).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "does not accept company member invitations through the registration program",
    () =>
      Effect.gen(function* () {
        const invitations = yield* Invitations;
        const registration = yield* createRegistration;
        const approved = yield* approveRegistration({
          registrationId: registration.id,
          actor: reviewer,
        });
        const companyInvitation = yield* invitations.issue({
          issuedBy: reviewer,
          intent: new CompanyMemberIntent({
            intent: "company_member",
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            inviteeEmail: details.email,
            role: "associate",
          }),
        });

        const wrongProgramExit = yield* acceptRegistrationInvitation({
          registrationId: approved.id,
          invitationId: companyInvitation.id,
          acceptedIdentity,
        }).pipe(Effect.exit);

        expect(Exit.isFailure(wrongProgramExit)).toBe(true);

        const accepted = yield* invitations.accept({
          invitationId: companyInvitation.id,
          acceptedIdentity,
          expectedIntent: "company_member",
        });

        expect(accepted._tag).toBe("AcceptedInvitation");
        expect(accepted.intent.intent).toBe("company_member");
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects revocation of accepted invitations", () =>
    Effect.gen(function* () {
      const registration = yield* createRegistration;
      const approved = yield* approveRegistration({
        registrationId: registration.id,
        actor: reviewer,
      });
      yield* acceptRegistrationInvitation({
        registrationId: approved.id,
        invitationId: approved.invitationId,
        acceptedIdentity,
      });

      const invitations = yield* Invitations;
      const exit = yield* invitations
        .revoke({
          invitationId: approved.invitationId,
          revokedBy: reviewer,
        })
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.provide(layerMemory))
  );
});
