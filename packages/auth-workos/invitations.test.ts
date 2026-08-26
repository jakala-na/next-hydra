/* oxlint-disable eslint/require-await -- WorkOS SDK test doubles intentionally implement asynchronous provider interfaces without network I/O. */
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
import {
  CompanyMemberInvitations,
  InvitationConflict,
  InvitationDeliveries,
  InvitationIssueOutcomeUnknown,
  InvitationNotFound,
  InvitationProviderFailure,
  RegistrationInvitations,
} from "@repo/registration/services/invitations";
import { RegistrationInvitationIssueAttempt } from "@repo/registration/services/registration-invitation-issue-attempts";
import type { RegistrationInvitationIssueAttemptsService } from "@repo/registration/services/registration-invitation-issue-attempts";
import {
  BadRequestException,
  NotFoundException,
  WorkOS,
} from "@workos-inc/node";
import type {
  Invitation as WorkosInvitation,
  User as WorkosUser,
} from "@workos-inc/node";
import { DateTime, Effect, Exit, Layer, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import {
  makeWorkosCompanyMemberInvitations,
  makeWorkosCompanyMemberIdentityProjection,
  makeWorkosInvitationCapabilities,
} from "./invitations";
import type { WorkosInvitationUserManagement } from "./invitations";

type WorkosInvitationState = "pending" | "accepted" | "expired" | "revoked";

const inviteeEmail = Redacted.make(Email.make("invitee@example.com"), {
  label: "email",
});

const actor = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-admin-1"),
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  email: Redacted.make(Email.make("admin@example.com"), { label: "email" }),
  roles: ["admin", "buyer"],
});

const acceptedIdentity = new AcceptedAuthIdentity({
  authUserId: AuthUserId.make("auth-invitee-1"),
  email: inviteeEmail,
  firstName: Redacted.make(PersonName.make("Invited"), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make("User"), { label: "personName" }),
});

const companyMemberIntent = new CompanyMemberIntent({
  businessUnitId: actor.businessUnitId,
  companyMemberInvitationId: CompanyMemberInvitationId.make(
    "company-invitation-1"
  ),
  intent: "company_member",
  inviteeEmail,
  inviteeName: {
    firstName: Redacted.make(PersonName.make("Invited"), {
      label: "personName",
    }),
    lastName: Redacted.make(PersonName.make("User"), {
      label: "personName",
    }),
  },
  roles: ["buyer", "approver"],
});

const registrationIntent = new RegistrationApprovalIntent({
  intent: "registration_approval",
  inviteeEmail,
  registrationId: RegistrationId.make("registration-1"),
  roles: ["admin", "buyer"],
});

const makeWorkosInvitation = (
  state: WorkosInvitationState,
  id = "invitation-1",
  overrides: Partial<WorkosInvitation> = {}
): WorkosInvitation => ({
  acceptInvitationUrl: "https://example.com/invite/token-1",
  acceptedAt: state === "accepted" ? "2026-01-03T00:00:00.000Z" : null,
  acceptedUserId: state === "accepted" ? acceptedIdentity.authUserId : null,
  createdAt: "2026-01-01T00:00:00.000Z",
  email: Redacted.value(inviteeEmail),
  expiresAt: "2026-01-10T00:00:00.000Z",
  id,
  inviterUserId: actor.authUserId,
  object: "invitation",
  organizationId: null,
  revokedAt: state === "revoked" ? "2026-01-04T00:00:00.000Z" : null,
  state,
  token: "token-1",
  updatedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});

const makeWorkosUser = (metadata: Record<string, string> = {}): WorkosUser => ({
  createdAt: "2026-01-01T00:00:00.000Z",
  email: Redacted.value(inviteeEmail),
  emailVerified: true,
  externalId: null,
  firstName: "Invited",
  id: acceptedIdentity.authUserId,
  lastName: "User",
  lastSignInAt: "2026-01-03T00:00:00.000Z",
  locale: null,
  metadata,
  object: "user",
  profilePictureUrl: null,
  updatedAt: "2026-01-03T00:00:00.000Z",
});

const makeUserManagement = (
  overrides: Partial<WorkosInvitationUserManagement> & {
    readonly sent?: (
      input: Parameters<WorkosInvitationUserManagement["sendInvitation"]>[0]
    ) => void;
  } = {}
): WorkosInvitationUserManagement => ({
  getInvitation: async () => makeWorkosInvitation("accepted"),
  listInvitations: async () => ({ data: [] }),
  revokeInvitation: async () => makeWorkosInvitation("revoked"),
  sendInvitation: async (input) => {
    overrides.sent?.(input);
    return makeWorkosInvitation("pending");
  },
  updateUser: async (input) =>
    await Promise.resolve(
      makeWorkosUser(
        Object.fromEntries(
          Object.entries(input.metadata ?? {}).filter(
            (entry): entry is [string, string] => entry[1] !== null
          )
        )
      )
    ),
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

const makeLayer = (userManagement: WorkosInvitationUserManagement) => {
  const capabilities = makeWorkosInvitationCapabilities(
    userManagement,
    makeIssueAttempts()
  );

  return Layer.mergeAll(
    Layer.succeed(
      CompanyMemberInvitations,
      capabilities.companyMemberInvitations
    ),
    Layer.succeed(InvitationDeliveries, capabilities.invitationDeliveries),
    Layer.succeed(RegistrationInvitations, capabilities.registrationInvitations)
  );
};

describe(makeWorkosInvitationCapabilities, () => {
  it("projects every accepted company role into WorkOS user metadata", async () => {
    let updatedUser:
      | Parameters<WorkosInvitationUserManagement["updateUser"]>[0]
      | undefined;
    const projection = makeWorkosCompanyMemberIdentityProjection(
      makeUserManagement({
        updateUser: async (input) => {
          updatedUser = input;
          return await Promise.resolve(makeWorkosUser());
        },
      })
    );

    await Effect.runPromise(
      projection.projectAcceptedInvitation({
        acceptedIdentity,
        intent: companyMemberIntent,
      })
    );

    expect(updatedUser).toStrictEqual({
      metadata: {
        invitation:
          '{"businessUnitId":"business-unit-1","companyMemberInvitationId":"company-invitation-1","intent":"company_member","roles":["buyer","approver"]}',
      },
      userId: acceptedIdentity.authUserId,
    });
  });

  it("issues invitations through the WorkOS SDK and returns the domain issue context", async () => {
    let sentInput:
      | Parameters<WorkosInvitationUserManagement["sendInvitation"]>[0]
      | undefined;
    const layer = makeLayer(
      makeUserManagement({
        sent: (input) => {
          sentInput = input;
        },
      })
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const invitations = yield* CompanyMemberInvitations;
        const invitation = yield* invitations.issue({
          intent: companyMemberIntent,
          issuedBy: actor,
        });

        expect(sentInput).toMatchObject({
          email: Redacted.value(inviteeEmail),
          inviterUserId: actor.authUserId,
        });
        expect(sentInput).not.toHaveProperty("roleSlug");
        expect(invitation.id).toBe(InvitationId.make("invitation-1"));
        expect(invitation.intent).toBe(companyMemberIntent);
        expect(invitation.issuedBy).toBe(actor);
      }).pipe(Effect.provide(layer))
    );
  });

  it("revokes a company-member invitation through the WorkOS SDK", async () => {
    let revokeCalls = 0;
    let invitationState: WorkosInvitationState = "pending";
    const capabilities = makeWorkosInvitationCapabilities(
      makeUserManagement({
        getInvitation: async () => makeWorkosInvitation(invitationState),
        revokeInvitation: async () => {
          revokeCalls += 1;
          invitationState = "revoked";
          return makeWorkosInvitation("revoked");
        },
      }),
      makeIssueAttempts()
    );

    const input = {
      intent: companyMemberIntent,
      invitationId: InvitationId.make("invitation-1"),
      issuedBy: actor,
      revokedBy: actor,
    } as const;
    const [revoked, repeated] = await Effect.runPromise(
      Effect.all(
        [
          capabilities.companyMemberInvitations.revoke(input),
          capabilities.companyMemberInvitations.revoke(input),
        ],
        { concurrency: 1 }
      )
    );

    expect(revoked).toMatchObject({
      _tag: "RevokedInvitation",
      intent: companyMemberIntent,
      revokedBy: actor,
    });
    expect(repeated).toEqual(revoked);
    expect(revokeCalls).toBe(1);
  });

  it("does not bind a pre-existing system invitation to a registration", async () => {
    let sendCalls = 0;
    const existing = makeWorkosInvitation("pending", "invitation-retry", {
      inviterUserId: null,
    });
    const capabilities = makeWorkosInvitationCapabilities(
      makeUserManagement({
        listInvitations: async () => ({ data: [existing] }),
        sendInvitation: async () => {
          sendCalls += 1;
          return makeWorkosInvitation("pending");
        },
      }),
      makeIssueAttempts()
    );

    const failure = await Effect.runPromise(
      capabilities.registrationInvitations
        .issue({
          intent: registrationIntent,
          issuedBy: registrationSystemActor,
        })
        .pipe(Effect.flip)
    );

    expect(failure._tag).toBe("InvitationConflict");
    expect(sendCalls).toBe(0);
  });

  it("checks every WorkOS invitation page before starting an issue attempt", async () => {
    let sendCalls = 0;
    const existing = makeWorkosInvitation("pending", "invitation-page-two", {
      inviterUserId: null,
    });
    const capabilities = makeWorkosInvitationCapabilities(
      makeUserManagement({
        listInvitations: async () => ({
          autoPagination: async () => [existing],
          data: [],
        }),
        sendInvitation: async () => {
          sendCalls += 1;
          return makeWorkosInvitation("pending");
        },
      }),
      makeIssueAttempts()
    );

    const failure = await Effect.runPromise(
      capabilities.registrationInvitations
        .issue({
          intent: registrationIntent,
          issuedBy: registrationSystemActor,
        })
        .pipe(Effect.flip)
    );

    expect(failure._tag).toBe("InvitationConflict");
    expect(sendCalls).toBe(0);
  });

  it("recovers only the exact invitation recorded by the durable issue checkpoint", async () => {
    const issued = makeWorkosInvitation("pending", "invitation-retry", {
      inviterUserId: null,
    });
    const attempts = makeIssueAttempts();
    let invitationCreated = false;
    let sendCalls = 0;
    let sentInput:
      | Parameters<WorkosInvitationUserManagement["sendInvitation"]>[0]
      | undefined;
    const capabilities = makeWorkosInvitationCapabilities(
      makeUserManagement({
        getInvitation: async () => issued,
        listInvitations: async () => ({
          data: invitationCreated ? [issued] : [],
        }),
        sendInvitation: async (input) => {
          sendCalls += 1;
          sentInput = input;
          invitationCreated = true;
          return issued;
        },
      }),
      attempts
    );

    const first = await Effect.runPromise(
      capabilities.registrationInvitations.issue({
        intent: registrationIntent,
        issuedBy: registrationSystemActor,
      })
    );
    const retry = await Effect.runPromise(
      capabilities.registrationInvitations.issue({
        intent: registrationIntent,
        issuedBy: registrationSystemActor,
      })
    );

    expect(first.id).toBe(InvitationId.make("invitation-retry"));
    expect(retry.id).toBe(first.id);
    expect(sendCalls).toBe(1);
    expect(sentInput).not.toHaveProperty("roleSlug");
  });

  it("reports outcome unknown instead of binding an email-only invitation", async () => {
    const issued = makeWorkosInvitation("pending", "invitation-recovered", {
      inviterUserId: null,
    });
    let listCalls = 0;
    const capabilities = makeWorkosInvitationCapabilities(
      makeUserManagement({
        listInvitations: async () => {
          listCalls += 1;
          return { data: listCalls === 1 ? [] : [issued] };
        },
        sendInvitation: async () => {
          throw new Error("response lost");
        },
      }),
      makeIssueAttempts()
    );

    const firstFailure = await Effect.runPromise(
      capabilities.registrationInvitations
        .issue({
          intent: registrationIntent,
          issuedBy: registrationSystemActor,
        })
        .pipe(Effect.flip)
    );
    const retryFailure = await Effect.runPromise(
      capabilities.registrationInvitations
        .issue({
          intent: registrationIntent,
          issuedBy: registrationSystemActor,
        })
        .pipe(Effect.flip)
    );

    expect(firstFailure).toBeInstanceOf(InvitationIssueOutcomeUnknown);
    expect(retryFailure).toBeInstanceOf(InvitationIssueOutcomeUnknown);
    expect(listCalls).toBe(2);
  });

  it("reports an ambiguous company-member write as outcome unknown", async () => {
    const capabilities = makeWorkosInvitationCapabilities(
      makeUserManagement({
        sendInvitation: async () => {
          throw new Error("response lost");
        },
      }),
      makeIssueAttempts()
    );

    const failure = await Effect.runPromise(
      capabilities.companyMemberInvitations
        .issue({ intent: companyMemberIntent, issuedBy: actor })
        .pipe(Effect.flip)
    );

    expect(failure).toBeInstanceOf(InvitationIssueOutcomeUnknown);
  });

  it("keeps a provider-confirmed issue rejection distinct from an ambiguous write", async () => {
    const capabilities = makeWorkosInvitationCapabilities(
      makeUserManagement({
        sendInvitation: async () => {
          await Promise.resolve();
          throw new BadRequestException({
            message: "invalid invitation",
            requestID: "request-1",
          });
        },
      }),
      makeIssueAttempts()
    );

    const failure = await Effect.runPromise(
      capabilities.companyMemberInvitations
        .issue({ intent: companyMemberIntent, issuedBy: actor })
        .pipe(Effect.flip)
    );

    expect(failure).toBeInstanceOf(InvitationProviderFailure);
  });

  it("maps the SDK's production 409 response to an invitation conflict", async () => {
    const workos = new WorkOS({
      apiKey: "sk_test_invitation",
      fetchFn: async () =>
        await Promise.resolve(
          Response.json(
            { message: "Invitation already exists" },
            {
              headers: { "X-Request-ID": "request-conflict-1" },
              status: 409,
            }
          )
        ),
    });
    const invitations = makeWorkosCompanyMemberInvitations(
      workos.userManagement
    );

    const failure = await Effect.runPromise(
      invitations
        .issue({ intent: companyMemberIntent, issuedBy: actor })
        .pipe(Effect.flip)
    );

    expect(failure).toBeInstanceOf(InvitationConflict);
  });

  it("reports an invalid successful issue response as outcome unknown", async () => {
    const capabilities = makeWorkosInvitationCapabilities(
      makeUserManagement({
        sendInvitation: async () =>
          await Promise.resolve(
            makeWorkosInvitation("pending", "", { expiresAt: "invalid" })
          ),
      }),
      makeIssueAttempts()
    );

    const failure = await Effect.runPromise(
      capabilities.companyMemberInvitations
        .issue({ intent: companyMemberIntent, issuedBy: actor })
        .pipe(Effect.flip)
    );

    expect(failure).toBeInstanceOf(InvitationIssueOutcomeUnknown);
  });

  it("maps provider reads to invitation delivery state", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const invitations = yield* InvitationDeliveries;
        const invitation = yield* invitations.get(
          InvitationId.make("invitation-1")
        );

        expect(invitation.status).toBe("accepted");
        expect(Redacted.value(invitation.inviteeEmail)).toBe(
          Redacted.value(inviteeEmail)
        );
      }).pipe(Effect.provide(makeLayer(makeUserManagement())))
    );
  });

  it("accepts webhook-confirmed invitations without mutating WorkOS state", async () => {
    let readInvitationId: string | undefined;
    let updatedUser:
      | Parameters<WorkosInvitationUserManagement["updateUser"]>[0]
      | undefined;

    await Effect.runPromise(
      Effect.gen(function* () {
        const invitations = yield* RegistrationInvitations;
        const accepted = yield* invitations.accept({
          acceptedIdentity,
          intent: registrationIntent,
          invitationId: InvitationId.make("invitation-1"),
          issuedBy: registrationSystemActor,
        });

        expect(accepted._tag).toBe("AcceptedInvitation");
        expect(accepted.acceptedBy).toStrictEqual(acceptedIdentity);
        expect(accepted.intent).toBe(registrationIntent);
        expect(accepted.issuedBy).toBe(registrationSystemActor);
      }).pipe(
        Effect.provide(
          makeLayer(
            makeUserManagement({
              getInvitation: async (invitationId) => {
                readInvitationId = invitationId;
                return makeWorkosInvitation("accepted");
              },
              updateUser: async (input) => {
                updatedUser = input;
                return await Promise.resolve(makeWorkosUser());
              },
            })
          )
        )
      )
    );

    expect(readInvitationId).toBe("invitation-1");
    expect(updatedUser).toStrictEqual({
      metadata: {
        invitation:
          '{"intent":"registration_approval","registrationId":"registration-1","roles":["admin","buyer"]}',
      },
      userId: acceptedIdentity.authUserId,
    });
  });

  it("trusts accepted identity from the webhook while WorkOS is eventually consistent", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const invitations = yield* RegistrationInvitations;
        const accepted = yield* invitations.accept({
          acceptedIdentity,
          intent: registrationIntent,
          invitationId: InvitationId.make("invitation-1"),
          issuedBy: registrationSystemActor,
        });

        expect(accepted._tag).toBe("AcceptedInvitation");
        expect(accepted.acceptedBy).toStrictEqual(acceptedIdentity);
      }).pipe(
        Effect.provide(
          makeLayer(
            makeUserManagement({
              getInvitation: async () => makeWorkosInvitation("pending"),
            })
          )
        )
      )
    );
  });

  it("rejects acceptance evidence for a different WorkOS identity", async () => {
    const differentIdentity = new AcceptedAuthIdentity({
      authUserId: AuthUserId.make("auth-other-1"),
      email: Redacted.make(Email.make("other@example.com"), {
        label: "email",
      }),
      firstName: acceptedIdentity.firstName,
      lastName: acceptedIdentity.lastName,
    });

    const failure = await Effect.runPromise(
      RegistrationInvitations.pipe(
        Effect.flatMap((invitations) =>
          invitations.accept({
            acceptedIdentity: differentIdentity,
            intent: registrationIntent,
            invitationId: InvitationId.make("invitation-1"),
            issuedBy: registrationSystemActor,
          })
        ),
        Effect.flip,
        Effect.provide(makeLayer(makeUserManagement()))
      )
    );

    expect(failure._tag).toBe("InvitationConflict");
  });

  it("rejects revoked invitations as conflicts", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const invitations = yield* RegistrationInvitations;
        const exit = yield* invitations
          .accept({
            acceptedIdentity,
            intent: registrationIntent,
            invitationId: InvitationId.make("invitation-1"),
            issuedBy: registrationSystemActor,
          })
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain(InvitationConflict.name);
        }
      }).pipe(
        Effect.provide(
          makeLayer(
            makeUserManagement({
              getInvitation: async () => makeWorkosInvitation("revoked"),
            })
          )
        )
      )
    );
  });

  it("returns a typed expiration error for expired invitations", async () => {
    const failure = await Effect.runPromise(
      RegistrationInvitations.pipe(
        Effect.flatMap((invitations) =>
          invitations.accept({
            acceptedIdentity,
            intent: registrationIntent,
            invitationId: InvitationId.make("invitation-1"),
            issuedBy: registrationSystemActor,
          })
        ),
        Effect.flip,
        Effect.provide(
          makeLayer(
            makeUserManagement({
              getInvitation: async () => makeWorkosInvitation("expired"),
            })
          )
        )
      )
    );

    expect(failure).toMatchObject({
      _tag: "InvitationExpired",
      expiredAt: DateTime.toDateUtc(
        DateTime.makeUnsafe("2026-01-10T00:00:00.000Z")
      ),
    } satisfies Partial<InvitationExpired>);
  });

  it("maps WorkOS not found failures to InvitationNotFound", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const invitationId = InvitationId.make("missing");
        const invitations = yield* InvitationDeliveries;
        const exit = yield* invitations.get(invitationId).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain(InvitationNotFound.name);
        }
      }).pipe(
        Effect.provide(
          makeLayer(
            makeUserManagement({
              getInvitation: async (invitationId) => {
                throw new NotFoundException({
                  path: `/user_management/invitations/${invitationId}`,
                  requestID: "request-1",
                });
              },
            })
          )
        )
      )
    );
  });

  it("maps WorkOS SDK failures to InvitationProviderFailure", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const invitations = yield* RegistrationInvitations;
        const exit = yield* invitations
          .accept({
            acceptedIdentity,
            intent: registrationIntent,
            invitationId: InvitationId.make("invitation-1"),
            issuedBy: registrationSystemActor,
          })
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain(
            InvitationProviderFailure.name
          );
        }
      }).pipe(
        Effect.provide(
          makeLayer(
            makeUserManagement({
              getInvitation: async () => {
                throw new Error("workos down");
              },
            })
          )
        )
      )
    );
  });
});
