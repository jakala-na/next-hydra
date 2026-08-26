import {
  CompanyActor,
  registrationSystemActor,
} from "@repo/registration/domain/actors";
import {
  AcceptedAuthIdentity,
  AuthUserId,
  CompanyMemberInvitationId,
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
import type { InvitationExpired } from "@repo/registration/services/invitations";
import { InvitationIssueOutcomeUnknown } from "@repo/registration/services/invitations";
import { RegistrationInvitationIssueAttempt } from "@repo/registration/services/registration-invitation-issue-attempts";
import type { RegistrationInvitationIssueAttemptsService } from "@repo/registration/services/registration-invitation-issue-attempts";
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
  roles: ["admin", "buyer"],
});
const companyActor = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("company-admin-1"),
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  email: Redacted.make(Email.make("admin@example.com"), { label: "email" }),
  roles: ["admin", "buyer"],
});
const companyMemberIntent = new CompanyMemberIntent({
  businessUnitId: companyActor.businessUnitId,
  companyMemberInvitationId: CompanyMemberInvitationId.make(
    "company-invitation-1"
  ),
  intent: "company_member",
  inviteeEmail,
  inviteeName: {
    firstName: Redacted.make(PersonName.make("Invited"), {
      label: "personName",
    }),
    lastName: Redacted.make(PersonName.make("Member"), {
      label: "personName",
    }),
  },
  roles: ["buyer", "approver"],
});
const acceptedIdentity = new AcceptedAuthIdentity({
  authUserId: AuthUserId.make("user-1"),
  email: inviteeEmail,
  firstName: Redacted.make(PersonName.make("Invited"), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make("Member"), {
    label: "personName",
  }),
});

const publicMetadata = {
  invitation: {
    intent: "registration_approval" as const,
    registrationId: RegistrationId.make("registration-1"),
    roles: ["admin", "buyer"] as const,
  },
};
const companyMemberPublicMetadata = {
  invitation: {
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    companyMemberInvitationId: CompanyMemberInvitationId.make(
      "company-invitation-1"
    ),
    intent: "company_member" as const,
    roles: ["buyer", "approver"] as const,
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

const makeIssueAttempts = (): RegistrationInvitationIssueAttemptsService => {
  const attempts = new Map<
    RegistrationId,
    RegistrationInvitationIssueAttempt
  >();

  return {
    recordIssued: (input) =>
      Effect.sync(() => {
        const current = attempts.get(input.registrationId);
        if (!current) {
          throw new Error("Invitation issue attempt was not started");
        }

        const recorded = new RegistrationInvitationIssueAttempt({
          excludedProviderInvitationIds: current.excludedProviderInvitationIds,
          providerInvitationId: input.providerInvitationId,
          registrationId: input.registrationId,
        });
        attempts.set(input.registrationId, recorded);
        return recorded;
      }),
    start: (input) =>
      Effect.sync(() => {
        const existing = attempts.get(input.registrationId);
        if (existing) {
          return { attempt: existing, started: false };
        }

        const attempt = new RegistrationInvitationIssueAttempt(input);
        attempts.set(input.registrationId, attempt);
        return { attempt, started: true };
      }),
  };
};

describe(makeClerkInvitationCapabilities, () => {
  it("issues a Clerk invitation with domain correlation metadata", async () => {
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
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
    );

    const issued = await Effect.runPromise(
      capabilities.registrationInvitations.issue({
        intent,
        issuedBy: registrationSystemActor,
      })
    );

    expect(createInput).toStrictEqual({
      emailAddress: "invitee@example.com",
      expiresInDays: 30,
      publicMetadata: {
        invitation: {
          intent: "registration_approval",
          registrationId: "registration-1",
          roles: ["admin", "buyer"],
        },
      },
      redirectUrl: "https://shop.example.com/accept-invitation",
    });
    expect(issued.intent).toBe(intent);
    expect(issued.id).toBe(InvitationId.make("invitation-1"));
    expect(issued.expiresAt).toStrictEqual(
      new Date("2026-01-31T00:00:00.000Z")
    );
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
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
    );

    const issued = await Effect.runPromise(
      capabilities.companyMemberInvitations.issue({
        intent: companyMemberIntent,
        issuedBy: companyActor,
      })
    );

    expect(createInput).toStrictEqual({
      emailAddress: "invitee@example.com",
      expiresInDays: 30,
      publicMetadata: companyMemberPublicMetadata,
      redirectUrl: "https://shop.example.com/accept-invitation",
    });
    expect(issued.intent).toBe(companyMemberIntent);
    expect(issued.issuedBy).toBe(companyActor);
  });

  it("revokes a company-member invitation through Clerk", async () => {
    let revokeCalls = 0;
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        getInvitationList: async () =>
          await Promise.resolve({
            data: [
              invitation("pending", {
                publicMetadata: companyMemberPublicMetadata,
              }),
            ],
          }),
        revokeInvitation: async () => {
          revokeCalls += 1;
          return await Promise.resolve(
            invitation("revoked", {
              publicMetadata: companyMemberPublicMetadata,
            })
          );
        },
      }),
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
    );

    const revoked = await Effect.runPromise(
      capabilities.companyMemberInvitations.revoke({
        intent: companyMemberIntent,
        invitationId: InvitationId.make("invitation-1"),
        issuedBy: companyActor,
        revokedBy: companyActor,
      })
    );

    expect(revoked).toMatchObject({
      _tag: "RevokedInvitation",
      intent: companyMemberIntent,
      revokedBy: companyActor,
    });
    expect(revokeCalls).toBe(1);
  });

  it("projects Clerk state as provider-neutral invitation delivery", async () => {
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        getInvitationList: async () =>
          await Promise.resolve({ data: [invitation()] }),
      }),
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
    );

    const delivery = await Effect.runPromise(
      capabilities.invitationDeliveries.get(InvitationId.make("invitation-1"))
    );

    expect(delivery.status).toBe("pending");
    expect(delivery.expiresAt).toStrictEqual(
      new Date("2026-01-31T00:00:00.000Z")
    );
    expect(Redacted.value(delivery.inviteeEmail)).toBe("invitee@example.com");
  });

  it("accepts webhook evidence while preserving registration intent", async () => {
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        getInvitationList: async () =>
          await Promise.resolve({ data: [invitation()] }),
      }),
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
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

  it("recovers only the exact Clerk invitation recorded by id", async () => {
    let createCalls = 0;
    const queries: string[] = [];
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        createInvitation: async () => {
          createCalls += 1;
          return await Promise.resolve(invitation());
        },
        getInvitationList: async ({ query }) => {
          await Promise.resolve();
          queries.push(query);
          return { data: [invitation()] };
        },
      }),
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
    );

    const issued = await Effect.runPromise(
      capabilities.registrationInvitations.issue({
        intent,
        issuedBy: registrationSystemActor,
      })
    );
    const recovered = await Effect.runPromise(
      capabilities.registrationInvitations.issue({
        intent,
        issuedBy: registrationSystemActor,
      })
    );

    expect(recovered.id).toBe(issued.id);
    expect(createCalls).toBe(1);
    expect(queries).toStrictEqual(["invitation-1"]);
  });

  it("never recovers a Clerk company-member invitation by email", async () => {
    let createCalls = 0;
    let listCalls = 0;
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        createInvitation: async () => {
          createCalls += 1;
          return await Promise.resolve(
            invitation("pending", {
              id: "invitation-2",
              publicMetadata: companyMemberPublicMetadata,
            })
          );
        },
        getInvitationList: async () => {
          listCalls += 1;
          return await Promise.resolve({
            data: [
              invitation("pending", {
                publicMetadata: companyMemberPublicMetadata,
              }),
            ],
          });
        },
      }),
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
    );

    const recovered = await Effect.runPromise(
      capabilities.companyMemberInvitations.issue({
        intent: companyMemberIntent,
        issuedBy: companyActor,
      })
    );

    expect(recovered.id).toBe(InvitationId.make("invitation-2"));
    expect(createCalls).toBe(1);
    expect(listCalls).toBe(0);
  });

  it("reports an ambiguous company-member write as outcome unknown", async () => {
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        createInvitation: async () => {
          await Promise.resolve();
          throw new Error("response lost");
        },
      }),
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
    );

    const failure = await Effect.runPromise(
      capabilities.companyMemberInvitations
        .issue({ intent: companyMemberIntent, issuedBy: companyActor })
        .pipe(Effect.flip)
    );

    expect(failure).toBeInstanceOf(InvitationIssueOutcomeUnknown);
  });

  it("reports outcome unknown without searching by email after a lost response", async () => {
    let listCalls = 0;
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        createInvitation: async () => {
          await Promise.resolve();
          throw new Error("response lost");
        },
        getInvitationList: async () => {
          await Promise.resolve();
          listCalls += 1;
          return { data: [invitation()] };
        },
      }),
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
    );

    await Effect.runPromise(
      capabilities.registrationInvitations
        .issue({ intent, issuedBy: registrationSystemActor })
        .pipe(Effect.flip)
    );
    const retryFailure = await Effect.runPromise(
      capabilities.registrationInvitations
        .issue({ intent, issuedBy: registrationSystemActor })
        .pipe(Effect.flip)
    );

    expect(retryFailure).toBeInstanceOf(InvitationIssueOutcomeUnknown);
    expect(listCalls).toBe(0);
  });

  it("does not fabricate an acceptance link when Clerk omits its ticket URL", async () => {
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        createInvitation: async () => {
          const { url: _url, ...withoutUrl } = invitation();
          return await Promise.resolve(withoutUrl);
        },
      }),
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
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
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
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

  it("returns a typed expiration error for an expired Clerk invitation", async () => {
    const capabilities = makeClerkInvitationCapabilities(
      makeApi({
        getInvitationList: async () =>
          await Promise.resolve({ data: [invitation("expired")] }),
      }),
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
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

    expect(failure).toMatchObject({
      _tag: "InvitationExpired",
      expiredAt: new Date("2026-01-31T00:00:00.000Z"),
    } satisfies Partial<InvitationExpired>);
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
      "https://shop.example.com/accept-invitation",
      makeIssueAttempts()
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
  });
});
