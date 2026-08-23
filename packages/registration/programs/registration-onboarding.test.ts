import { describe, expect, it } from "@effect/vitest";
import {
  CommerceAccount,
  CommerceAssociateMembership,
} from "@repo/commerce/domain/commerce-account";
import {
  CommerceAccountUnavailable,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import type { AcceptedCommerceIdentity } from "@repo/commerce/services/commerce-accounts";
import { StoreKey } from "@repo/commerce/store";
import { Effect, Exit, Layer, Redacted } from "effect";

import {
  CompanyActor,
  RegistrationReviewerActor,
  registrationSystemActor,
} from "../domain/actors";
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
import {
  CompanyMemberIntent,
  PendingInvitation,
  RegistrationApprovalIntent,
} from "../domain/invitations";
import {
  CompanyAddress,
  CompanyRegistrationDetails,
} from "../domain/registration";
import {
  CompanyMemberInvitations,
  invitationCapabilitiesLayerMemory,
  InvitationConflict,
  InvitationDeliveries,
  RegistrationInvitations,
} from "../services/invitations";
import type { RegistrationInvitationIssueInput } from "../services/invitations";
import { RegistrationWorkflow } from "../services/registration-workflow";
import type { RegistrationInvitationEvent } from "../services/registration-workflow";
import {
  Registrations,
  RegistrationTransitionConflict,
} from "../services/registrations";
import { resumeRegistrationInvitationForRegistration } from "./registration-invitation-events";
import {
  acceptRegistrationInvitation,
  approveRegistration,
  rejectRegistration,
  revokeRegistrationInvitation,
} from "./registration-onboarding";

const layerMemory = Layer.mergeAll(
  Registrations.layerMemory,
  CommerceAccounts.layerMemory,
  invitationCapabilitiesLayerMemory
);

const reviewer = new RegistrationReviewerActor({
  actorType: "registration_reviewer",
  authUserId: AuthUserId.make("auth-reviewer-1"),
  email: Redacted.make(Email.make("reviewer@example.com"), {
    label: "email",
  }),
  name: "Registration Reviewer",
});

const companyOwner = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-company-owner-1"),
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  email: Redacted.make(Email.make("owner@example.com"), { label: "email" }),
  role: "owner",
});

const details = new CompanyRegistrationDetails({
  address: new CompanyAddress({
    additionalStreetInfo: Redacted.make(AddressLine.make("Suite 42"), {
      label: "addressLine",
    }),
    city: Redacted.make(City.make("New York"), { label: "city" }),
    country: CountryCode.make("US"),
    postalCode: Redacted.make(PostalCode.make("10001"), {
      label: "postalCode",
    }),
    region: Redacted.make(Region.make("NY"), { label: "region" }),
    streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
      label: "addressLine",
    }),
  }),
  companyName: CompanyName.make("Hydra Supplies"),
  companyPhone: Redacted.make(PhoneNumber.make("+1 555 0100"), {
    label: "companyPhone",
  }),
  contactFirstName: Redacted.make(PersonName.make("Ada"), {
    label: "personName",
  }),
  contactLastName: Redacted.make(PersonName.make("Lovelace"), {
    label: "personName",
  }),
  email: Redacted.make(Email.make("ada@example.com"), { label: "email" }),
  vatId: Redacted.make(VatId.make("VAT-123"), { label: "vatId" }),
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
  return yield* registrations.createAwaitingApproval({
    details,
    storeKey: StoreKey.make("default-store"),
  });
});

describe("registration onboarding", () => {
  it.effect(
    "approves a registration by provisioning commerce and issuing an owner invitation",
    () =>
      Effect.gen(function* () {
        const registration = yield* createRegistration;

        const approved = yield* approveRegistration({
          actor: reviewer,
          reason: "Looks good",
          registrationId: registration.id,
        });
        const invitations = yield* InvitationDeliveries;
        const invitation = yield* invitations.get(approved.invitationId);

        expect(approved._tag).toBe("ApprovedRegistration");
        expect(approved.decision.decision).toBe("approved");
        expect(approved.commerceAccount.registrationId).toBe(registration.id);
        expect(invitation.status).toBe("pending");
        expect(String(approved.details.vatId)).toBe("<redacted:vatId>");
        expect(String(approved.details.email)).toBe("<redacted:email>");
        expect(String(approved.details.address.streetName)).toBe(
          "<redacted:addressLine>"
        );
        expect(String(approved.details.address.postalCode)).toBe(
          "<redacted:postalCode>"
        );
        expect(String(invitation.inviteeEmail)).toBe("<redacted:email>");
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("approval retries return the existing approved registration", () =>
    Effect.gen(function* () {
      const registration = yield* createRegistration;

      const first = yield* approveRegistration({
        actor: reviewer,
        registrationId: registration.id,
      });
      const second = yield* approveRegistration({
        actor: reviewer,
        registrationId: registration.id,
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
          actor: reviewer,
          reason: "Not eligible",
          registrationId: registration.id,
        });

        expect(rejected._tag).toBe("RejectedRegistration");
        expect(rejected.decision.decision).toBe("rejected");

        const approveAfterReject = yield* approveRegistration({
          actor: reviewer,
          registrationId: registration.id,
        }).pipe(Effect.exit);

        expect(Exit.isFailure(approveAfterReject)).toBeTruthy();
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("fails incompatible repeated decisions with typed conflicts", () =>
    Effect.gen(function* () {
      const registration = yield* createRegistration;
      yield* approveRegistration({
        actor: reviewer,
        registrationId: registration.id,
      });

      const rejectedExit = yield* rejectRegistration({
        actor: reviewer,
        registrationId: registration.id,
      }).pipe(Effect.exit);

      expect(Exit.isFailure(rejectedExit)).toBeTruthy();
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
        addAssociate: () =>
          Effect.fail(
            new CommerceAccountUnavailable({
              message: "commerce down",
            })
          ),
        createFromRegistration: () =>
          Effect.fail(
            new CommerceAccountUnavailable({
              message: "commerce down",
            })
          ),
        getCustomerIdByAuthUserId: () =>
          Effect.fail(
            new CommerceAccountUnavailable({
              message: "commerce down",
            })
          ),
        getCustomerProfile: () =>
          Effect.fail(
            new CommerceAccountUnavailable({
              message: "commerce down",
            })
          ),
        hasCustomerWithEmail: () =>
          Effect.fail(
            new CommerceAccountUnavailable({
              message: "commerce down",
            })
          ),
        linkRegistrantIdentity: () =>
          Effect.fail(
            new CommerceAccountUnavailable({
              message: "commerce down",
            })
          ),
        listBusinessUnitMembershipsForCustomerInStore: () =>
          Effect.fail(
            new CommerceAccountUnavailable({
              message: "commerce down",
            })
          ),
      });
      const layer = Layer.mergeAll(
        Registrations.layerMemory,
        commerceFailureLayer,
        invitationCapabilitiesLayerMemory
      );

      return Effect.gen(function* () {
        const registration = yield* createRegistration;
        const exit = yield* approveRegistration({
          actor: reviewer,
          registrationId: registration.id,
        }).pipe(Effect.exit);
        const registrations = yield* Registrations;
        const current = yield* registrations.get(registration.id);

        expect(Exit.isFailure(exit)).toBeTruthy();
        expect(current._tag).toBe("AwaitingApprovalRegistration");
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    "reuses commerce state when invitation issuance fails and approval is retried",
    () => {
      let issueAttempts = 0;
      const flakyInvitationsLayer = Layer.succeed(RegistrationInvitations)({
        accept: () => Effect.die("not used in this test"),
        issue: (input: RegistrationInvitationIssueInput) =>
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
                createdAt: new Date(0),
                id: InvitationId.make("invitation-retry"),
                intent: input.intent,
                issuedBy: input.issuedBy,
              })
            );
          }),
        revoke: () => Effect.die("not used in this test"),
      });
      const failingLayer = Layer.mergeAll(
        Registrations.layerMemory,
        CommerceAccounts.layerMemory,
        flakyInvitationsLayer
      );

      return Effect.gen(function* () {
        const registration = yield* createRegistration;
        const failed = yield* approveRegistration({
          actor: reviewer,
          registrationId: registration.id,
        }).pipe(Effect.exit);
        const registrations = yield* Registrations;
        const awaiting = yield* registrations.get(registration.id);

        expect(Exit.isFailure(failed)).toBeTruthy();
        expect(awaiting._tag).toBe("AwaitingApprovalRegistration");

        const approved = yield* approveRegistration({
          actor: reviewer,
          registrationId: registration.id,
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
          actor: reviewer,
          registrationId: registration.id,
        });

        const first = yield* acceptRegistrationInvitation({
          acceptedIdentity,
          invitationId: approved.invitationId,
          registrationId: approved.id,
        });
        const second = yield* acceptRegistrationInvitation({
          acceptedIdentity,
          invitationId: approved.invitationId,
          registrationId: approved.id,
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
        addAssociate: (input) =>
          Effect.sync(
            () =>
              new CommerceAssociateMembership({
                authUserId: input.acceptedIdentity.authUserId,
                businessUnitId: input.businessUnitId,
                customerId: CommerceCustomerId.make(
                  `customer-${input.acceptedIdentity.authUserId}`
                ),
                role: input.role,
              })
          ),
        createFromRegistration: (registration) =>
          Effect.succeed(
            new CommerceAccount({
              businessUnitId: CommerceBusinessUnitId.make(
                `business-unit-${registration.id}`
              ),
              customerId: CommerceCustomerId.make(
                `customer-${registration.id}`
              ),
              registrationId: registration.id,
            })
          ),
        getCustomerIdByAuthUserId: () => Effect.die("not used"),
        getCustomerProfile: () => Effect.die("not used"),
        hasCustomerWithEmail: () => Effect.succeed(false),
        linkRegistrantIdentity: (input) =>
          Effect.sync(() => {
            linkedIdentities.push(input.acceptedIdentity);
            return input.registration.commerceAccount;
          }),
        listBusinessUnitMembershipsForCustomerInStore: () =>
          Effect.die("not used"),
      })
    );
    const layer = Layer.mergeAll(
      Registrations.layerMemory,
      commerceLayer,
      invitationCapabilitiesLayerMemory
    );

    return Effect.gen(function* () {
      const registration = yield* createRegistration;
      const approved = yield* approveRegistration({
        actor: reviewer,
        registrationId: registration.id,
      });

      yield* acceptRegistrationInvitation({
        acceptedIdentity,
        invitationId: approved.invitationId,
        registrationId: approved.id,
      });

      expect(linkedIdentities).toStrictEqual([acceptedIdentity]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "fails registration invitation acceptance by a different auth user",
    () =>
      Effect.gen(function* () {
        const registration = yield* createRegistration;
        const approved = yield* approveRegistration({
          actor: reviewer,
          registrationId: registration.id,
        });

        yield* acceptRegistrationInvitation({
          acceptedIdentity,
          invitationId: approved.invitationId,
          registrationId: approved.id,
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
          acceptedIdentity: differentIdentity,
          invitationId: approved.invitationId,
          registrationId: approved.id,
        }).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "does not accept company member invitations through the registration program",
    () =>
      Effect.gen(function* () {
        const invitations = yield* CompanyMemberInvitations;
        const registration = yield* createRegistration;
        const approved = yield* approveRegistration({
          actor: reviewer,
          registrationId: registration.id,
        });
        const companyInvitation = yield* invitations.issue({
          intent: new CompanyMemberIntent({
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            intent: "company_member",
            inviteeEmail: details.email,
            role: "associate",
          }),
          issuedBy: companyOwner,
        });

        const wrongProgramExit = yield* acceptRegistrationInvitation({
          acceptedIdentity,
          invitationId: companyInvitation.id,
          registrationId: approved.id,
        }).pipe(Effect.exit);

        expect(Exit.isFailure(wrongProgramExit)).toBeTruthy();

        expect(invitations).not.toHaveProperty("accept");
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects revocation of accepted invitations", () =>
    Effect.gen(function* () {
      const registration = yield* createRegistration;
      const approved = yield* approveRegistration({
        actor: reviewer,
        registrationId: registration.id,
      });
      yield* acceptRegistrationInvitation({
        acceptedIdentity,
        invitationId: approved.invitationId,
        registrationId: approved.id,
      });

      const invitations = yield* RegistrationInvitations;
      const exit = yield* invitations
        .revoke({
          intent: new RegistrationApprovalIntent({
            intent: "registration_approval",
            inviteeEmail: approved.details.email,
            registrationId: approved.id,
            role: "owner",
          }),
          invitationId: approved.invitationId,
          issuedBy: registrationSystemActor,
          revokedBy: reviewer,
        })
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "publishes a revoked event after the application revokes an invitation",
    () => {
      const resumed: (readonly [InvitationId, RegistrationInvitationEvent])[] =
        [];
      const workflowLayer = Layer.succeed(RegistrationWorkflow, {
        resumeInvitation: (invitationId, event) =>
          Effect.sync(() => {
            resumed.push([invitationId, event]);
          }),
        resumeReview: () => Effect.void,
        start: () => Effect.void,
      });
      const layer = Layer.mergeAll(layerMemory, workflowLayer);

      return Effect.gen(function* () {
        const registration = yield* createRegistration;
        const approved = yield* approveRegistration({
          actor: reviewer,
          registrationId: registration.id,
        });

        const revoked = yield* revokeRegistrationInvitation({
          actor: reviewer,
          registrationId: registration.id,
        });
        const deliveries = yield* InvitationDeliveries;
        const delivery = yield* deliveries.get(approved.invitationId);

        expect(revoked._tag).toBe("RevokedInvitation");
        expect(delivery.status).toBe("revoked");
        expect(resumed).toStrictEqual([
          [approved.invitationId, { event: "revoked" }],
        ]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    "resumes invitation workflow from the approved registration's stored invitation",
    () => {
      const resumedInvitationIds: InvitationId[] = [];
      const workflowLayer = Layer.succeed(RegistrationWorkflow, {
        resumeInvitation: (invitationId) =>
          Effect.sync(() => {
            resumedInvitationIds.push(invitationId);
          }),
        resumeReview: () => Effect.void,
        start: () => Effect.void,
      });
      const layer = Layer.mergeAll(layerMemory, workflowLayer);

      return Effect.gen(function* () {
        const registration = yield* createRegistration;
        const approved = yield* approveRegistration({
          actor: reviewer,
          registrationId: registration.id,
        });

        yield* resumeRegistrationInvitationForRegistration({
          event: { event: "revoked" },
          registrationId: registration.id,
        });

        expect(resumedInvitationIds).toStrictEqual([approved.invitationId]);
      }).pipe(Effect.provide(layer));
    }
  );
});
