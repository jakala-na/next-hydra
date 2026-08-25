/* oxlint-disable typescript/no-base-to-string -- Redacted domain values deliberately stringify to their protected representation in assertions. */
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
import { TestClock } from "effect/testing";

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
import type { ApprovedRegistration } from "../domain/registration";
import {
  CompanyMemberInvitations,
  invitationCapabilitiesLayerMemory,
  InvitationConflict,
  InvitationDeliveries,
  InvitationExpired,
  RegistrationInvitations,
} from "../services/invitations";
import type { RegistrationInvitationIssueInput } from "../services/invitations";
import { RegistrationEmails } from "../services/registration-emails";
import { RegistrationQueries } from "../services/registration-queries";
import { RegistrationWorkflow } from "../services/registration-workflow";
import type { RegistrationInvitationEvent } from "../services/registration-workflow";
import {
  Registrations,
  RegistrationTransitionConflict,
} from "../services/registrations";
import {
  resumeRegistrationInvitationForInvitation,
  resumeRegistrationInvitationForRegistration,
} from "./registration-invitation-events";
import { notifyRegistrationInvitationExpired } from "./registration-notifications";
import {
  acceptRegistrationInvitation,
  approveRegistration,
  expireRegistrationInvitation,
  rejectRegistration,
  revokeRegistrationInvitation,
} from "./registration-onboarding";

const layerMemory = Layer.mergeAll(
  Registrations.layerMemory,
  CommerceAccounts.layerMemory,
  invitationCapabilitiesLayerMemory
);

const queryLayerFor = (registration: ApprovedRegistration) =>
  RegistrationQueries.layerMemoryFrom([
    {
      createdAt: registration.createdAt,
      id: String(registration.id),
      lastModifiedAt: registration.updatedAt,
      registration,
    },
  ]);

const reviewer = new RegistrationReviewerActor({
  actorType: "registration_reviewer",
  authUserId: AuthUserId.make("auth-reviewer-1"),
  email: Redacted.make(Email.make("reviewer@example.com"), {
    label: "email",
  }),
  name: "Registration Reviewer",
});

const companyAdministrator = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-company-admin-1"),
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  email: Redacted.make(Email.make("admin@example.com"), { label: "email" }),
  roles: ["admin", "buyer"],
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
    "approves a registration and issues an administrator invitation before commerce provisioning",
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
        expect(approved.onboardingStatus).toBe("invited");
        expect(invitation.status).toBe("pending");
        expect([
          String(approved.details.vatId),
          String(approved.details.email),
          String(approved.details.address.streetName),
          String(approved.details.address.postalCode),
          String(invitation.inviteeEmail),
        ]).toStrictEqual([
          "<redacted:vatId>",
          "<redacted:email>",
          "<redacted:addressLine>",
          "<redacted:postalCode>",
          "<redacted:email>",
        ]);
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

      expect(second.onboardingStatus).toBe("invited");
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

  it.effect("approves without requiring commerce provisioning", () => {
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
      const approved = yield* approveRegistration({
        actor: reviewer,
        registrationId: registration.id,
      });
      const registrations = yield* Registrations;
      const current = yield* registrations.get(registration.id);

      expect(approved.onboardingStatus).toBe("invited");
      expect(current._tag).toBe("ApprovedRegistration");
    }).pipe(Effect.provide(layer));
  });

  it.effect("retries invitation issuance before approving", () => {
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
              expiresAt: new Date("2026-02-01T00:00:00.000Z"),
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

      expect(approved.onboardingStatus).toBe("invited");
      expect(approved.invitationId).toBe(InvitationId.make("invitation-retry"));
    }).pipe(Effect.provide(failingLayer));
  });

  it.effect(
    "expires registration invitations without changing the approval decision",
    () =>
      Effect.gen(function* () {
        const registration = yield* createRegistration;
        const approved = yield* approveRegistration({
          actor: reviewer,
          registrationId: registration.id,
        });
        const deliveries = yield* InvitationDeliveries;
        const pending = yield* deliveries.get(approved.invitationId);

        yield* TestClock.adjust("31 days");

        const expired = yield* deliveries.get(approved.invitationId);
        const acceptanceFailure = yield* acceptRegistrationInvitation({
          acceptedIdentity,
          invitationId: approved.invitationId,
          registrationId: approved.id,
        }).pipe(Effect.flip);
        yield* expireRegistrationInvitation({
          invitationId: approved.invitationId,
          registrationId: approved.id,
        });
        const registrations = yield* Registrations;
        const current = yield* registrations.get(approved.id);

        expect(expired.status).toBe("expired");
        expect(expired.expiresAt).toStrictEqual(pending.expiresAt);
        expect(acceptanceFailure).toBeInstanceOf(InvitationExpired);
        expect(current._tag).toBe("ApprovedRegistration");
        if (current._tag === "ApprovedRegistration") {
          expect(current.onboardingStatus).toBe("expired");
        }
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "notifies an approved registrant that an expired invitation requires a new registration",
    () => {
      const sent: string[] = [];
      const emailsLayer = Layer.succeed(
        RegistrationEmails,
        RegistrationEmails.of({
          sendApprovedToRegistrant: () => Effect.void,
          sendAwaitingApprovalToApprover: () => Effect.void,
          sendAwaitingApprovalToRegistrant: () => Effect.void,
          sendInvitationExpiredToRegistrant: ({ registration }) =>
            Effect.sync(() => {
              sent.push(String(registration.id));
            }),
          sendRejectedToRegistrant: () => Effect.void,
        })
      );

      return Effect.gen(function* () {
        const registration = yield* createRegistration;
        const approved = yield* approveRegistration({
          actor: reviewer,
          registrationId: registration.id,
        });

        yield* notifyRegistrationInvitationExpired({
          registrationId: approved.id,
        });

        expect(sent).toStrictEqual([String(approved.id)]);
      }).pipe(Effect.provide(Layer.mergeAll(layerMemory, emailsLayer)));
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
        expect(first.onboardingStatus).toBe("accepted");
        expect(second.onboardingStatus).toBe("accepted");
        expect([first.acceptedAuthUserId, second.acceptedAuthUserId]).toEqual([
          acceptedIdentity.authUserId,
          acceptedIdentity.authUserId,
        ]);
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "adds the accepted registrant as the business unit administrator",
    () => {
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
                  roles: input.roles,
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
              return input.commerceAccount;
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
    }
  );

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
            roles: ["buyer"],
          }),
          issuedBy: companyAdministrator,
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
            roles: ["admin", "buyer"],
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

        yield* resumeRegistrationInvitationForInvitation({
          event: { event: "revoked" },
          invitationId: approved.invitationId,
        }).pipe(Effect.provide(queryLayerFor(approved)));

        expect(revoked._tag).toBe("RevokedInvitation");
        expect(delivery.status).toBe("revoked");
        expect(resumed).toStrictEqual([
          [approved.invitationId, { event: "revoked" }],
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
        const current = yield* Registrations.pipe(
          Effect.flatMap((registrations) => registrations.get(registration.id))
        );

        expect(resumedInvitationIds).toStrictEqual([approved.invitationId]);
        expect(current).toMatchObject({ onboardingStatus: "revoked" });
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    "reconciles provider revocation by invitation id before resuming",
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

        yield* resumeRegistrationInvitationForInvitation({
          event: { event: "revoked" },
          invitationId: approved.invitationId,
        }).pipe(Effect.provide(queryLayerFor(approved)));
        const current = yield* Registrations.pipe(
          Effect.flatMap((registrations) => registrations.get(registration.id))
        );

        expect(current).toMatchObject({ onboardingStatus: "revoked" });
        expect(resumedInvitationIds).toStrictEqual([approved.invitationId]);
      }).pipe(Effect.provide(layer));
    }
  );
});
