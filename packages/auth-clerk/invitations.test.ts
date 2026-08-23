import {
  CompanyActor,
  registrationSystemActor,
} from "@repo/registration/domain/actors";
import {
  AcceptedAuthIdentity,
  AuthUserId,
  CommerceBusinessUnitId,
  Email,
  InvitationId,
  PersonName,
  RegistrationId,
} from "@repo/registration/domain/identity";
import {
  CompanyMemberIntent,
  RegistrationApprovalIntent,
} from "@repo/registration/domain/invitations";
import { Effect, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import { makeClerkInvitationCapabilities } from "./invitations";
import type { ClerkInvitationsApi } from "./invitations";

const inviteeEmail = Redacted.make(Email.make("invitee@example.com"), {
  label: "email",
});
const intent = new RegistrationApprovalIntent({
  intent: "registration_approval",
  inviteeEmail,
  registrationId: RegistrationId.make("registration-1"),
  role: "owner",
});
const companyActor = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("company-owner-1"),
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  email: Redacted.make(Email.make("owner@example.com"), { label: "email" }),
  role: "owner",
});
const companyMemberIntent = new CompanyMemberIntent({
  businessUnitId: companyActor.businessUnitId,
  intent: "company_member",
  inviteeEmail,
  role: "associate",
});
const acceptedIdentity = new AcceptedAuthIdentity({
  authUserId: AuthUserId.make("user-1"),
  email: inviteeEmail,
  firstName: Redacted.make(PersonName.make("Invited"), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make("Owner"), {
    label: "personName",
  }),
});

const publicMetadata = {
  nextHydra: {
    invitation: {
      intent: "registration_approval" as const,
      registrationId: RegistrationId.make("registration-1"),
      role: "owner" as const,
    },
    version: 1 as const,
  },
};
const companyMemberPublicMetadata = {
  nextHydra: {
    invitation: {
      businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
      intent: "company_member" as const,
      role: "associate" as const,
    },
    version: 1 as const,
  },
};

type ClerkInvitationResponse = Awaited<
  ReturnType<ClerkInvitationsApi["createInvitation"]>
>;

const invitation = (
  status: ClerkInvitationResponse["status"] = "pending",
  overrides: Partial<ClerkInvitationResponse> = {}
): ClerkInvitationResponse => ({
  createdAt: Date.parse("2026-01-01T00:00:00.000Z"),
  emailAddress: Redacted.value(inviteeEmail),
  id: "invitation-1",
  publicMetadata,
  status,
  updatedAt: Date.parse("2026-01-02T00:00:00.000Z"),
  url: "https://example.clerk.accounts.dev/invitations/accept",
  ...overrides,
});

const makeApi = (
  overrides: Partial<ClerkInvitationsApi> = {}
): ClerkInvitationsApi => ({
  createInvitation: async () => await Promise.resolve(invitation()),
  getInvitationList: async () => await Promise.resolve({ data: [] }),
  revokeInvitation: async () => await Promise.resolve(invitation("revoked")),
  ...overrides,
});

describe(makeClerkInvitationCapabilities, () => {
  it("issues a Clerk invitation with namespaced domain correlation metadata", async () => {
    let createInput:
      | Parameters<ClerkInvitationsApi["createInvitation"]>[0]
      | undefined;
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        createInvitation: async (input) => {
          await Promise.resolve();
          createInput = input;
          return invitation();
        },
      }),
      "https://shop.example.com/accept-invitation"
    );

    const issued = await Effect.runPromise(
      capabilities.registrationInvitations.issue({
        intent,
        issuedBy: registrationSystemActor,
      })
    );

    expect(createInput).toStrictEqual({
      emailAddress: "invitee@example.com",
      publicMetadata: {
        nextHydra: {
          invitation: {
            intent: "registration_approval",
            registrationId: "registration-1",
            role: "owner",
          },
          version: 1,
        },
      },
      redirectUrl: "https://shop.example.com/accept-invitation",
    });
    expect(issued.intent).toBe(intent);
    expect(issued.id).toBe(InvitationId.make("invitation-1"));
  });

  it("issues a company-member invitation through Clerk", async () => {
    let createInput:
      | Parameters<ClerkInvitationsApi["createInvitation"]>[0]
      | undefined;
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        createInvitation: async (input) => {
          await Promise.resolve();
          createInput = input;
          return invitation("pending", {
            publicMetadata: companyMemberPublicMetadata,
          });
        },
      }),
      "https://shop.example.com/accept-invitation"
    );

    const issued = await Effect.runPromise(
      capabilities.companyMemberInvitations.issue({
        intent: companyMemberIntent,
        issuedBy: companyActor,
      })
    );

    expect(createInput).toStrictEqual({
      emailAddress: "invitee@example.com",
      publicMetadata: companyMemberPublicMetadata,
      redirectUrl: "https://shop.example.com/accept-invitation",
    });
    expect(issued.intent).toBe(companyMemberIntent);
    expect(issued.issuedBy).toBe(companyActor);
  });

  it("projects Clerk state as provider-neutral invitation delivery", async () => {
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        getInvitationList: async () =>
          await Promise.resolve({ data: [invitation()] }),
      }),
      "https://shop.example.com/accept-invitation"
    );

    const delivery = await Effect.runPromise(
      capabilities.invitationDeliveries.get(InvitationId.make("invitation-1"))
    );

    expect(delivery.status).toBe("pending");
    expect(Redacted.value(delivery.inviteeEmail)).toBe("invitee@example.com");
  });

  it("accepts webhook evidence while preserving registration intent", async () => {
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        getInvitationList: async () =>
          await Promise.resolve({ data: [invitation()] }),
      }),
      "https://shop.example.com/accept-invitation"
    );

    const accepted = await Effect.runPromise(
      capabilities.registrationInvitations.accept({
        acceptedIdentity,
        intent,
        invitationId: InvitationId.make("invitation-1"),
        issuedBy: registrationSystemActor,
      })
    );

    expect(accepted.acceptedBy).toBe(acceptedIdentity);
    expect(accepted.intent).toBe(intent);
  });

  it("reuses a matching Clerk invitation when approval is retried", async () => {
    let createCalls = 0;
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        createInvitation: async () => {
          createCalls += 1;
          return await Promise.resolve(invitation());
        },
        getInvitationList: async () =>
          await Promise.resolve({ data: [invitation()] }),
      }),
      "https://shop.example.com/accept-invitation"
    );

    const recovered = await Effect.runPromise(
      capabilities.registrationInvitations.issue({
        intent,
        issuedBy: registrationSystemActor,
      })
    );

    expect(recovered.id).toBe(InvitationId.make("invitation-1"));
    expect(createCalls).toBe(0);
  });

  it("reuses a matching Clerk company-member invitation", async () => {
    let createCalls = 0;
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        createInvitation: async () => {
          createCalls += 1;
          return await Promise.resolve(invitation());
        },
        getInvitationList: async () =>
          await Promise.resolve({
            data: [
              invitation("pending", {
                publicMetadata: companyMemberPublicMetadata,
              }),
            ],
          }),
      }),
      "https://shop.example.com/accept-invitation"
    );

    const recovered = await Effect.runPromise(
      capabilities.companyMemberInvitations.issue({
        intent: companyMemberIntent,
        issuedBy: companyActor,
      })
    );

    expect(recovered.id).toBe(InvitationId.make("invitation-1"));
    expect(createCalls).toBe(0);
  });

  it("does not fabricate an acceptance link when Clerk omits its ticket URL", async () => {
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        createInvitation: async () => {
          const { url: _url, ...withoutUrl } = invitation();
          return await Promise.resolve(withoutUrl);
        },
      }),
      "https://shop.example.com/accept-invitation"
    );

    const issued = await Effect.runPromise(
      capabilities.registrationInvitations.issue({
        intent,
        issuedBy: registrationSystemActor,
      })
    );

    expect(issued.acceptInvitationUrl).toBeUndefined();
  });

  it("rejects acceptance after Clerk revokes the invitation", async () => {
    const requestedStatuses: (string | undefined)[] = [];
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        getInvitationList: async ({ status }) => {
          await Promise.resolve();
          requestedStatuses.push(status);
          return {
            data: status === "revoked" ? [invitation("revoked")] : [],
          };
        },
      }),
      "https://shop.example.com/accept-invitation"
    );

    const failure = await Effect.runPromise(
      capabilities.registrationInvitations
        .accept({
          acceptedIdentity,
          intent,
          invitationId: InvitationId.make("invitation-1"),
          issuedBy: registrationSystemActor,
        })
        .pipe(Effect.flip)
    );

    expect(failure._tag).toBe("InvitationConflict");
    expect(requestedStatuses).toStrictEqual([undefined, "revoked"]);
  });

  it("revokes once and lets the application publish the workflow event", async () => {
    let status: ClerkInvitationResponse["status"] = "pending";
    let revokeCalls = 0;
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        getInvitationList: async ({ status: requestedStatus }) => {
          await Promise.resolve();
          const visible =
            (requestedStatus === undefined && status !== "revoked") ||
            requestedStatus === status;
          return { data: visible ? [invitation(status)] : [] };
        },
        revokeInvitation: async () => {
          revokeCalls += 1;
          status = "revoked";
          return await Promise.resolve(invitation(status));
        },
      }),
      "https://shop.example.com/accept-invitation"
    );
    const revoke = async () =>
      await Effect.runPromise(
        capabilities.registrationInvitations.revoke({
          intent,
          invitationId: InvitationId.make("invitation-1"),
          issuedBy: registrationSystemActor,
          revokedBy: registrationSystemActor,
        })
      );

    const first = await revoke();
    const second = await revoke();

    expect([first._tag, second._tag]).toStrictEqual([
      "RevokedInvitation",
      "RevokedInvitation",
    ]);
    expect(revokeCalls).toBe(1);
    expect(capabilities.registrationInvitationRevocationEvents.source).toBe(
      "application_command"
    );
  });
});
