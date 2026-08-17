import {
  CommerceAccount,
  CommerceAssociateMembership,
} from "@repo/commerce/domain/commerce-account";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { StoreKey } from "@repo/commerce/store";
import {
  getRegistrationApprovalHookToken,
  getRegistrationInvitationHookToken,
  RegistrationId,
} from "@repo/registration";
import { RegistrationReviewerActor } from "@repo/registration/domain/actors";
import {
  AddressLine,
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
  VatId,
} from "@repo/registration/domain/identity";
import {
  AcceptedInvitation,
  PendingInvitation,
} from "@repo/registration/domain/invitations";
import {
  ApprovalProcessingRegistration,
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
  RejectedRegistration,
} from "@repo/registration/domain/registration";
import type { Registration } from "@repo/registration/domain/registration";
import {
  InvitationNotFound,
  Invitations,
} from "@repo/registration/services/invitations";
import { RegistrationEmails } from "@repo/registration/services/registration-emails";
import type { RegistrationEmailNotification } from "@repo/registration/services/registration-emails";
import {
  RegistrationNotFound,
  Registrations,
} from "@repo/registration/services/registrations";
import { Effect, Layer, Redacted } from "effect";
import { beforeEach, expect, test, vi } from "vitest";

const workflowMocks = vi.hoisted(() => ({
  createHook: vi.fn(),
}));

vi.mock(import("workflow"), () => ({
  createHook: workflowMocks.createHook,
}));

const reviewer = {
  authUserId: "auth-reviewer-1",
  email: "reviewer@example.com",
  name: "Registration Reviewer",
};

const details = new CompanyRegistrationDetails({
  address: new CompanyAddress({
    streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
      label: "addressLine",
    }),
    postalCode: Redacted.make(PostalCode.make("10001"), {
      label: "postalCode",
    }),
    city: Redacted.make(City.make("New York"), { label: "city" }),
    country: CountryCode.make("US"),
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

const makeAwaitingRegistration = (registrationId: string) =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    createdAt: new Date("2026-03-22T00:00:00.000Z"),
    details,
    id: RegistrationId.make(registrationId),
    status: "awaiting_approval",
    storeKey: StoreKey.make("default-store"),
    updatedAt: new Date("2026-03-22T00:00:00.000Z"),
  });

const makeWorkflowLayer = (seedRegistration: Registration) => {
  let current = seedRegistration;
  const emailNotifications: RegistrationEmailNotification[] = [];
  const invitations = new Map<string, PendingInvitation>();
  const commerceAccounts = new Map<string, CommerceAccount>();
  const linkedAuthUsers: string[] = [];
  const ownerAssociates: CommerceAssociateMembership[] = [];

  const registrationsLayer = Layer.succeed(
    Registrations,
    Registrations.of({
      createAwaitingApproval: () => Effect.die("not used"),
      discardAwaitingApproval: () => Effect.die("not used"),
      findByInvitationId: () => Effect.die("not used"),
      get: (registrationId) =>
        current.id === registrationId
          ? Effect.succeed(current)
          : Effect.fail(
              new RegistrationNotFound({
                message: `Registration ${registrationId} was not found`,
                registrationId,
              })
            ),
      markApprovalProcessing: (input) => {
        if (current.id !== input.registrationId) {
          return Effect.fail(
            new RegistrationNotFound({
              message: `Registration ${input.registrationId} was not found`,
              registrationId: input.registrationId,
            })
          );
        }

        const processing = new ApprovalProcessingRegistration({
          _tag: "ApprovalProcessingRegistration",
          createdAt: current.createdAt,
          details: current.details,
          id: current.id,
          requestedDecision: input.decision,
          status: "approval_processing",
          storeKey: current.storeKey,
          updatedAt: new Date("2026-03-22T00:00:01.000Z"),
        });

        current = processing;
        return Effect.succeed(processing);
      },
      markApproved: (input) => {
        if (current.id !== input.registrationId) {
          return Effect.fail(
            new RegistrationNotFound({
              message: `Registration ${input.registrationId} was not found`,
              registrationId: input.registrationId,
            })
          );
        }

        const approved = new ApprovedRegistration({
          _tag: "ApprovedRegistration",
          commerceAccount: input.commerceAccount,
          createdAt: current.createdAt,
          decision: input.decision,
          details: current.details,
          id: current.id,
          invitationId: input.invitationId,
          status: "approved",
          storeKey: current.storeKey,
          updatedAt: new Date("2026-03-22T00:00:01.000Z"),
        });

        current = approved;
        return Effect.succeed(approved);
      },
      markRejected: (input) => {
        if (current.id !== input.registrationId) {
          return Effect.fail(
            new RegistrationNotFound({
              message: `Registration ${input.registrationId} was not found`,
              registrationId: input.registrationId,
            })
          );
        }

        const rejected = new RejectedRegistration({
          _tag: "RejectedRegistration",
          createdAt: current.createdAt,
          decision: input.decision,
          details: current.details,
          id: current.id,
          status: "rejected",
          storeKey: current.storeKey,
          updatedAt: new Date("2026-03-22T00:00:01.000Z"),
        });

        current = rejected;
        return Effect.succeed(rejected);
      },
    })
  );
  const emailsLayer = Layer.succeed(
    RegistrationEmails,
    RegistrationEmails.of({
      sendApprovedToRegistrant: ({ registration: emailRegistration }) =>
        Effect.sync(() => {
          emailNotifications.push({
            notification: "registrant_approved",
            registrationId: String(emailRegistration.id),
          });
        }),
      sendAwaitingApprovalToApprover: ({ registration: emailRegistration }) =>
        Effect.sync(() => {
          emailNotifications.push({
            notification: "approver_awaiting_approval",
            registrationId: String(emailRegistration.id),
          });
        }),
      sendAwaitingApprovalToRegistrant: ({ registration: emailRegistration }) =>
        Effect.sync(() => {
          emailNotifications.push({
            notification: "registrant_awaiting_approval",
            registrationId: String(emailRegistration.id),
          });
        }),
      sendRejectedToRegistrant: ({ registration: emailRegistration }) =>
        Effect.sync(() => {
          emailNotifications.push({
            notification: "registrant_rejected",
            registrationId: String(emailRegistration.id),
          });
        }),
    })
  );
  const invitationsLayer = Layer.succeed(
    Invitations,
    Invitations.of({
      accept: (input) => {
        const invitation = invitations.get(String(input.invitationId));

        if (!invitation) {
          return Effect.fail(
            new InvitationNotFound({
              message: `Invitation ${input.invitationId} was not found`,
              invitationId: input.invitationId,
            })
          );
        }

        return Effect.succeed(
          new AcceptedInvitation({
            _tag: "AcceptedInvitation",
            id: invitation.id,
            intent: invitation.intent,
            issuedBy: invitation.issuedBy,
            acceptedBy: input.acceptedIdentity,
            createdAt: invitation.createdAt,
            acceptedAt: new Date("2026-03-22T00:00:02.000Z"),
          })
        );
      },
      get: (invitationId) => {
        const invitation = invitations.get(String(invitationId));

        return invitation
          ? Effect.succeed(invitation)
          : Effect.fail(
              new InvitationNotFound({
                message: `Invitation ${invitationId} was not found`,
                invitationId,
              })
            );
      },
      issue: (input) =>
        Effect.sync(() => {
          const invitation = new PendingInvitation({
            _tag: "PendingInvitation",
            id: InvitationId.make(crypto.randomUUID()),
            intent: input.intent,
            issuedBy: input.issuedBy,
            createdAt: new Date("2026-03-22T00:00:01.000Z"),
            acceptInvitationUrl: "https://workos.test/invitations/accept",
          });

          invitations.set(String(invitation.id), invitation);
          return invitation;
        }),
      revoke: () => Effect.die("not used"),
    })
  );
  const commerceAccountsLayer = Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      addAssociate: ({ acceptedIdentity, businessUnitId, role }) =>
        Effect.sync(() => {
          const membership = new CommerceAssociateMembership({
            businessUnitId,
            customerId: CommerceCustomerId.make(
              `customer-${acceptedIdentity.authUserId}`
            ),
            authUserId: acceptedIdentity.authUserId,
            role,
          });

          ownerAssociates.push(membership);
          return membership;
        }),
      createFromRegistration: (commerceRegistration) =>
        Effect.sync(() => {
          const existing = commerceAccounts.get(
            String(commerceRegistration.id)
          );

          if (existing) {
            return existing;
          }

          const account = new CommerceAccount({
            registrationId: commerceRegistration.id,
            customerId: CommerceCustomerId.make(
              `customer-${commerceRegistration.id}`
            ),
            businessUnitId: CommerceBusinessUnitId.make(
              `business-unit-${commerceRegistration.id}`
            ),
          });

          commerceAccounts.set(String(commerceRegistration.id), account);
          return account;
        }),
      getCustomerIdByAuthUserId: () => Effect.die("not used"),
      getCustomerProfile: () => Effect.die("not used"),
      hasCustomerWithEmail: () => Effect.succeed(false),
      linkRegistrantIdentity: ({
        registration: linkedRegistration,
        acceptedIdentity,
      }) =>
        Effect.sync(() => {
          linkedAuthUsers.push(String(acceptedIdentity.authUserId));
          ownerAssociates.push(
            new CommerceAssociateMembership({
              businessUnitId: linkedRegistration.commerceAccount.businessUnitId,
              customerId: linkedRegistration.commerceAccount.customerId,
              authUserId: acceptedIdentity.authUserId,
              role: "owner",
            })
          );
          return linkedRegistration.commerceAccount;
        }),
      listBusinessUnitMembershipsForCustomerInStore: () =>
        Effect.die("not used"),
    })
  );

  return {
    get current() {
      return current;
    },
    emailNotifications,
    layer: Layer.mergeAll(
      registrationsLayer,
      commerceAccountsLayer,
      invitationsLayer,
      emailsLayer
    ),
    linkedAuthUsers,
    ownerAssociates,
  };
};

const loadWorkflow = async (
  layer: Layer.Layer<
    Registrations | CommerceAccounts | Invitations | RegistrationEmails
  >
) => {
  vi.doMock("../lib/registration/runtime", () => ({
    registrationLayer: layer,
  }));

  return await import("../workflows/register-company");
};

beforeEach(() => {
  vi.resetModules();
  workflowMocks.createHook.mockReset();
});

test("registration workflow waits on the deterministic registration approval hook", async () => {
  const registrationId = crypto.randomUUID();
  const state = makeWorkflowLayer(makeAwaitingRegistration(registrationId));
  workflowMocks.createHook.mockResolvedValue({
    decision: "rejected",
    reason: "Not eligible",
    reviewer,
  });

  const { registerCompanyWorkflow } = await loadWorkflow(state.layer);
  await registerCompanyWorkflow({ registrationId });

  expect(workflowMocks.createHook).toHaveBeenCalledWith({
    token: getRegistrationApprovalHookToken(registrationId),
  });
  expect(state.emailNotifications).toStrictEqual([
    {
      notification: "registrant_awaiting_approval",
      registrationId,
    },
    {
      notification: "approver_awaiting_approval",
      registrationId,
    },
    {
      notification: "registrant_rejected",
      registrationId,
    },
  ]);
});

test("registration workflow rejects an invalid approval hook payload", async () => {
  const registrationId = crypto.randomUUID();
  const state = makeWorkflowLayer(makeAwaitingRegistration(registrationId));
  workflowMocks.createHook.mockResolvedValue({
    decision: "unexpected",
    reviewer,
  });

  const { registerCompanyWorkflow } = await loadWorkflow(state.layer);

  await expect(registerCompanyWorkflow({ registrationId })).rejects.toThrow();
  expect(state.current).toBeInstanceOf(AwaitingApprovalRegistration);
});

test("registration workflow approval step runs the Effect approval program", async () => {
  const registrationId = crypto.randomUUID();
  const state = makeWorkflowLayer(makeAwaitingRegistration(registrationId));
  workflowMocks.createHook
    .mockResolvedValueOnce({
      decision: "approved",
      reason: "Looks good",
      reviewer,
    })
    .mockResolvedValueOnce({
      acceptedIdentity: {
        authUserId: "auth-user-1",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      },
      event: "accepted",
    });

  const { registerCompanyWorkflow } = await loadWorkflow(state.layer);
  const result = await registerCompanyWorkflow({ registrationId });

  expect(result).toMatchObject({
    invitationId: expect.any(String),
    registrationId,
    status: "approved",
  });
  expect(state.current._tag).toBe("ApprovedRegistration");
  if (state.current._tag === "ApprovedRegistration") {
    const commerceAccount: CommerceAccount = state.current.commerceAccount;
    expect(String(commerceAccount.customerId)).toBe(
      `customer-${registrationId}`
    );
    expect(String(state.current.invitationId)).toStrictEqual(
      expect.any(String)
    );
    expect(state.current.decision.actor).toBeInstanceOf(
      RegistrationReviewerActor
    );
    expect(workflowMocks.createHook).toHaveBeenNthCalledWith(2, {
      token: getRegistrationInvitationHookToken(
        String(state.current.invitationId)
      ),
    });
  }
  expect(state.linkedAuthUsers).toStrictEqual(["auth-user-1"]);
  expect(state.ownerAssociates).toMatchObject([
    {
      authUserId: "auth-user-1",
      role: "owner",
    },
  ]);
  expect(state.emailNotifications).toStrictEqual([
    {
      notification: "registrant_awaiting_approval",
      registrationId,
    },
    {
      notification: "approver_awaiting_approval",
      registrationId,
    },
    {
      notification: "registrant_approved",
      registrationId,
    },
  ]);
});

test("registration workflow rejection step runs the Effect rejection program", async () => {
  const registrationId = crypto.randomUUID();
  const state = makeWorkflowLayer(makeAwaitingRegistration(registrationId));
  workflowMocks.createHook.mockResolvedValue({
    decision: "rejected",
    reason: "Not eligible",
    reviewer,
  });

  const { registerCompanyWorkflow } = await loadWorkflow(state.layer);
  const result = await registerCompanyWorkflow({ registrationId });

  expect(result).toMatchObject({
    approvalReason: "Not eligible",
    registrationId,
    status: "rejected",
  });
  expect(state.current).toBeInstanceOf(RejectedRegistration);
  expect(state.emailNotifications).toStrictEqual([
    {
      notification: "registrant_awaiting_approval",
      registrationId,
    },
    {
      notification: "approver_awaiting_approval",
      registrationId,
    },
    {
      notification: "registrant_rejected",
      registrationId,
    },
  ]);
});
