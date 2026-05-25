import {
  getRegistrationApprovalHookToken,
  getRegistrationInvitationHookToken,
  RegistrationId,
} from "@repo/registration-effect";
import { RegistrationReviewerActor } from "@repo/registration-effect/domain/actors";
import {
  CommerceAccount,
  CommerceAssociateMembership,
} from "@repo/registration-effect/domain/commerce";
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
} from "@repo/registration-effect/domain/identity";
import {
  AcceptedInvitation,
  PendingInvitation,
} from "@repo/registration-effect/domain/invitations";
import {
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
  type Registration,
  RejectedRegistration,
} from "@repo/registration-effect/domain/registration";
import { CommerceAccounts } from "@repo/registration-effect/services/commerce-account";
import {
  InvitationNotFound,
  Invitations,
} from "@repo/registration-effect/services/invitations";
import {
  type RegistrationEmailNotification,
  RegistrationEmails,
} from "@repo/registration-effect/services/registration-emails";
import {
  RegistrationNotFound,
  Registrations,
} from "@repo/registration-effect/services/registrations";
import { Effect, Layer, Redacted } from "effect";
import { beforeEach, expect, test, vi } from "vitest";

const workflowMocks = vi.hoisted(() => ({
  createHook: vi.fn(),
}));

vi.mock("workflow", () => ({
  createHook: workflowMocks.createHook,
}));

const reviewer = {
  authUserId: "auth-reviewer-1",
  email: "reviewer@example.com",
  name: "Registration Reviewer",
};

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
    postalCode: Redacted.make(PostalCode.make("10001"), {
      label: "postalCode",
    }),
    city: Redacted.make(City.make("New York"), { label: "city" }),
    country: CountryCode.make("US"),
  }),
});

const makeAwaitingRegistration = (registrationId: string) =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    status: "awaiting_approval",
    id: RegistrationId.make(registrationId),
    details,
    createdAt: new Date("2026-03-22T00:00:00.000Z"),
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
          status: "approved",
          id: current.id,
          details: current.details,
          decision: input.decision,
          commerceAccount: input.commerceAccount,
          invitationId: input.invitationId,
          createdAt: current.createdAt,
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
          status: "rejected",
          id: current.id,
          details: current.details,
          decision: input.decision,
          createdAt: current.createdAt,
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
      sendAwaitingApprovalToRegistrant: ({ registration: emailRegistration }) =>
        Effect.sync(() => {
          emailNotifications.push({
            notification: "registrant_awaiting_approval",
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
      sendApprovedToRegistrant: ({ registration: emailRegistration }) =>
        Effect.sync(() => {
          emailNotifications.push({
            notification: "registrant_approved",
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
      revoke: () => Effect.die("not used"),
    })
  );
  const commerceAccountsLayer = Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
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
    })
  );

  return {
    get current() {
      return current;
    },
    emailNotifications,
    linkedAuthUsers,
    ownerAssociates,
    layer: Layer.mergeAll(
      registrationsLayer,
      commerceAccountsLayer,
      invitationsLayer,
      emailsLayer
    ),
  };
};

const loadWorkflow = async (
  layer: Layer.Layer<
    Registrations | CommerceAccounts | Invitations | RegistrationEmails
  >
) => {
  vi.doMock("../lib/registration-effect-runtime", () => ({
    registrationEffectLayer: layer,
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
    reviewer,
    reason: "Not eligible",
  });

  const { registerCompanyWorkflow } = await loadWorkflow(state.layer);
  await registerCompanyWorkflow({ registrationId });

  expect(workflowMocks.createHook).toHaveBeenCalledWith({
    token: getRegistrationApprovalHookToken(registrationId),
  });
  expect(state.emailNotifications).toEqual([
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

test("registration workflow approval step runs the Effect approval program", async () => {
  const registrationId = crypto.randomUUID();
  const state = makeWorkflowLayer(makeAwaitingRegistration(registrationId));
  workflowMocks.createHook
    .mockResolvedValueOnce({
      decision: "approved",
      reviewer,
      reason: "Looks good",
    })
    .mockResolvedValueOnce({
      event: "accepted",
      acceptedIdentity: {
        authUserId: "auth-user-1",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      },
    });

  const { registerCompanyWorkflow } = await loadWorkflow(state.layer);
  const result = await registerCompanyWorkflow({ registrationId });

  expect(result).toMatchObject({
    registrationId,
    status: "approved",
    invitationId: expect.any(String),
  });
  expect(state.current._tag).toBe("ApprovedRegistration");
  if (state.current._tag === "ApprovedRegistration") {
    const commerceAccount: CommerceAccount = state.current.commerceAccount;
    expect(String(commerceAccount.customerId)).toBe(
      `customer-${registrationId}`
    );
    expect(String(state.current.invitationId)).toEqual(expect.any(String));
    expect(state.current.decision.actor).toBeInstanceOf(
      RegistrationReviewerActor
    );
    expect(workflowMocks.createHook).toHaveBeenNthCalledWith(2, {
      token: getRegistrationInvitationHookToken(
        String(state.current.invitationId)
      ),
    });
  }
  expect(state.linkedAuthUsers).toEqual(["auth-user-1"]);
  expect(state.ownerAssociates).toMatchObject([
    {
      authUserId: "auth-user-1",
      role: "owner",
    },
  ]);
  expect(state.emailNotifications).toEqual([
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
    reviewer,
    reason: "Not eligible",
  });

  const { registerCompanyWorkflow } = await loadWorkflow(state.layer);
  const result = await registerCompanyWorkflow({ registrationId });

  expect(result).toMatchObject({
    registrationId,
    status: "rejected",
    approvalReason: "Not eligible",
  });
  expect(state.current).toBeInstanceOf(RejectedRegistration);
  expect(state.emailNotifications).toEqual([
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
