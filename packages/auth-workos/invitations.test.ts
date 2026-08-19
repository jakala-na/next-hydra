import { CompanyActor } from "@repo/registration/domain/actors";
import {
  AcceptedAuthIdentity,
  AuthUserId,
  CommerceBusinessUnitId,
  Email,
  InvitationId,
  PersonName,
} from "@repo/registration/domain/identity";
import { CompanyMemberIntent } from "@repo/registration/domain/invitations";
import {
  InvitationConflict,
  InvitationNotFound,
  InvitationProviderFailure,
  Invitations,
} from "@repo/registration/services/invitations";
import { NotFoundException } from "@workos-inc/node";
import type { Invitation as WorkosInvitation } from "@workos-inc/node";
import { Effect, Exit, Layer, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import { makeWorkosInvitations } from "./invitations";
import type { WorkosInvitationUserManagement } from "./invitations";

type WorkosInvitationState = "pending" | "accepted" | "expired" | "revoked";

const inviteeEmail = Redacted.make(Email.make("invitee@example.com"), {
  label: "email",
});

const actor = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-owner-1"),
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  email: Redacted.make(Email.make("owner@example.com"), { label: "email" }),
  role: "owner",
});

const acceptedIdentity = new AcceptedAuthIdentity({
  authUserId: AuthUserId.make("auth-invitee-1"),
  email: inviteeEmail,
  firstName: Redacted.make(PersonName.make("Invited"), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make("User"), { label: "personName" }),
});

const intent = new CompanyMemberIntent({
  businessUnitId: actor.businessUnitId,
  intent: "company_member",
  inviteeEmail,
  role: "associate",
});

const makeWorkosInvitation = (
  state: WorkosInvitationState,
  id = "invitation-1"
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
});

const makeUserManagement = (
  overrides: Partial<WorkosInvitationUserManagement> & {
    readonly sent?: (
      input: Parameters<WorkosInvitationUserManagement["sendInvitation"]>[0]
    ) => void;
  } = {}
): WorkosInvitationUserManagement => ({
  getInvitation: async () => makeWorkosInvitation("accepted"),
  revokeInvitation: async () => makeWorkosInvitation("revoked"),
  sendInvitation: async (input) => {
    overrides.sent?.(input);
    return makeWorkosInvitation("pending");
  },
  ...overrides,
});

const makeLayer = (userManagement: WorkosInvitationUserManagement) =>
  Layer.succeed(Invitations, makeWorkosInvitations(userManagement));

describe(makeWorkosInvitations, () => {
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
        const invitations = yield* Invitations;
        const invitation = yield* invitations.issue({
          intent,
          issuedBy: actor,
        });

        expect(sentInput).toMatchObject({
          email: Redacted.value(inviteeEmail),
          inviterUserId: actor.authUserId,
          roleSlug: "associate",
        });
        expect(invitation.id).toBe(InvitationId.make("invitation-1"));
        expect(invitation.intent).toBe(intent);
        expect(invitation.issuedBy).toBe(actor);
      }).pipe(Effect.provide(layer))
    );
  });

  it("maps provider reads to provider-managed invitation context", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const invitations = yield* Invitations;
        const invitation = yield* invitations.get(
          InvitationId.make("invitation-1")
        );

        expect(invitation._tag).toBe("AcceptedInvitation");
        expect(invitation.intent.intent).toBe("provider_managed");
      }).pipe(Effect.provide(makeLayer(makeUserManagement())))
    );
  });

  it("accepts webhook-confirmed invitations without mutating WorkOS state", async () => {
    let readInvitationId: string | undefined;

    await Effect.runPromise(
      Effect.gen(function* () {
        const invitations = yield* Invitations;
        const accepted = yield* invitations.accept({
          acceptedIdentity,
          expectedIntent: "company_member",
          invitationId: InvitationId.make("invitation-1"),
        });

        expect(accepted._tag).toBe("AcceptedInvitation");
        expect(accepted.acceptedBy).toStrictEqual(acceptedIdentity);
        expect(accepted.intent.intent).toBe("provider_managed");
      }).pipe(
        Effect.provide(
          makeLayer(
            makeUserManagement({
              getInvitation: async (invitationId) => {
                readInvitationId = invitationId;
                return makeWorkosInvitation("accepted");
              },
            })
          )
        )
      )
    );

    expect(readInvitationId).toBe("invitation-1");
  });

  it("trusts accepted identity from the webhook while WorkOS is eventually consistent", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const invitations = yield* Invitations;
        const accepted = yield* invitations.accept({
          acceptedIdentity,
          expectedIntent: "company_member",
          invitationId: InvitationId.make("invitation-1"),
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

  it("rejects revoked or expired invitations", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const invitations = yield* Invitations;
        const exit = yield* invitations
          .accept({
            acceptedIdentity,
            expectedIntent: "company_member",
            invitationId: InvitationId.make("invitation-1"),
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

  it("maps WorkOS not found failures to InvitationNotFound", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const invitationId = InvitationId.make("missing");
        const invitations = yield* Invitations;
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
        const invitations = yield* Invitations;
        const exit = yield* invitations
          .accept({
            acceptedIdentity,
            expectedIntent: "company_member",
            invitationId: InvitationId.make("invitation-1"),
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
