import {
  Clock,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Ref,
  Schema,
} from "effect";

import type { Actor } from "../domain/actors";
import { InvitationId } from "../domain/identity";
import type { AcceptedAuthIdentity, RegistrationId } from "../domain/identity";
import {
  AcceptedInvitation,
  PendingInvitation,
  RevokedInvitation,
} from "../domain/invitations";
import type {
  CompanyMemberIntent,
  Invitation,
  InvitationIntent,
  RegistrationApprovalIntent,
} from "../domain/invitations";

export class InvitationNotFound extends Schema.TaggedError<InvitationNotFound>()(
  "InvitationNotFound",
  {
    invitationId: InvitationId,
    message: Schema.String,
  }
) {}

export class InvitationConflict extends Schema.TaggedError<InvitationConflict>()(
  "InvitationConflict",
  {
    message: Schema.String,
  }
) {}

export class InvitationProviderFailure extends Schema.TaggedError<InvitationProviderFailure>()(
  "InvitationProviderFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals(["issue", "read", "accept", "revoke"]),
  }
) {}

export type InvitationIssueError =
  | InvitationConflict
  | InvitationProviderFailure;
export type InvitationReadError =
  | InvitationNotFound
  | InvitationProviderFailure;
export type InvitationAcceptError =
  | InvitationNotFound
  | InvitationConflict
  | InvitationProviderFailure;
export type InvitationRevokeError =
  | InvitationNotFound
  | InvitationConflict
  | InvitationProviderFailure;

export interface IssueInvitationInput {
  readonly intent: InvitationIntent;
  readonly issuedBy: Actor;
}

export interface AcceptInvitationInput {
  readonly invitationId: InvitationId;
  readonly acceptedIdentity: AcceptedAuthIdentity;
  readonly expectedIntent: InvitationIntent["intent"];
}

export interface RevokeInvitationInput {
  readonly invitationId: InvitationId;
  readonly revokedBy: Actor;
}

type InvitationStore = ReadonlyMap<InvitationId, Invitation>;

const nowDate = Clock.currentTimeMillis.pipe(
  Effect.map((time) => new Date(time))
);

const isRegistrationApprovalIntent = (
  intent: InvitationIntent
): intent is RegistrationApprovalIntent =>
  intent.intent === "registration_approval";

const isCompanyMemberIntent = (
  intent: InvitationIntent
): intent is CompanyMemberIntent => intent.intent === "company_member";

const findRegistrationApprovalInvitation = (
  invitations: Iterable<Invitation>,
  registrationId: RegistrationId
) =>
  [...invitations].find(
    (invitation) =>
      invitation.intent.intent === "registration_approval" &&
      invitation.intent.registrationId === registrationId
  );

const findPendingCompanyMemberInvitation = (
  invitations: Iterable<Invitation>,
  intent: CompanyMemberIntent
) =>
  [...invitations].find(
    (invitation): invitation is PendingInvitation =>
      invitation._tag === "PendingInvitation" &&
      invitation.intent.intent === "company_member" &&
      invitation.intent.businessUnitId === intent.businessUnitId &&
      Redacted.value(invitation.intent.inviteeEmail) ===
        Redacted.value(intent.inviteeEmail)
  );

export class Invitations extends Context.Service<
  Invitations,
  {
    readonly issue: (
      input: IssueInvitationInput
    ) => Effect.Effect<PendingInvitation, InvitationIssueError>;
    readonly get: (
      invitationId: InvitationId
    ) => Effect.Effect<Invitation, InvitationReadError>;
    readonly accept: (
      input: AcceptInvitationInput
    ) => Effect.Effect<AcceptedInvitation, InvitationAcceptError>;
    readonly revoke: (
      input: RevokeInvitationInput
    ) => Effect.Effect<RevokedInvitation, InvitationRevokeError>;
  }
>()("@repo/registration/Invitations") {
  static readonly layerMemory = Layer.effect(
    Invitations,
    Effect.gen(function* () {
      const store = yield* Ref.make<InvitationStore>(new Map());

      const issue = Effect.fn("Invitations.issue")(function* (
        input: IssueInvitationInput
      ) {
        const invitations = yield* Ref.get(store);

        if (isRegistrationApprovalIntent(input.intent)) {
          const existing = findRegistrationApprovalInvitation(
            invitations.values(),
            input.intent.registrationId
          );

          if (existing) {
            if (existing._tag !== "PendingInvitation") {
              return yield* new InvitationConflict({
                message: "Registration approval invitation already progressed",
              });
            }

            return existing;
          }
        }

        if (isCompanyMemberIntent(input.intent)) {
          const existing = findPendingCompanyMemberInvitation(
            invitations.values(),
            input.intent
          );

          if (existing) {
            if (
              existing.intent.intent === "company_member" &&
              existing.intent.role !== input.intent.role
            ) {
              return yield* new InvitationConflict({
                message:
                  "Pending company invitation already exists with a different role",
              });
            }

            return existing;
          }
        }

        const id = InvitationId.make(
          yield* Effect.sync(() => crypto.randomUUID())
        );
        const createdAt = yield* nowDate;
        const invitation = new PendingInvitation({
          _tag: "PendingInvitation",
          createdAt,
          id,
          intent: input.intent,
          issuedBy: input.issuedBy,
        });

        yield* Ref.update(store, (current) =>
          new Map(current).set(id, invitation)
        );

        return invitation;
      });

      const get = Effect.fn("Invitations.get")(function* (
        invitationId: InvitationId
      ) {
        const invitations = yield* Ref.get(store);
        return yield* Option.fromNullishOr(invitations.get(invitationId)).pipe(
          Effect.fromOption,
          Effect.mapError(
            () =>
              new InvitationNotFound({
                invitationId,
                message: `Invitation ${invitationId} was not found`,
              })
          )
        );
      });

      const accept = Effect.fn("Invitations.accept")(function* (
        input: AcceptInvitationInput
      ) {
        const invitations = yield* Ref.get(store);
        const current = yield* Option.fromNullishOr(
          invitations.get(input.invitationId)
        ).pipe(
          Effect.fromOption,
          Effect.mapError(
            () =>
              new InvitationNotFound({
                invitationId: input.invitationId,
                message: `Invitation ${input.invitationId} was not found`,
              })
          )
        );

        if (current.intent.intent !== input.expectedIntent) {
          return yield* new InvitationConflict({
            message: `Invitation is not for ${input.expectedIntent}`,
          });
        }

        if (current._tag === "AcceptedInvitation") {
          if (
            current.acceptedBy.authUserId === input.acceptedIdentity.authUserId
          ) {
            return current;
          }

          return yield* new InvitationConflict({
            message: "Invitation was accepted by a different auth user",
          });
        }

        if (current._tag === "RevokedInvitation") {
          return yield* new InvitationConflict({
            message: "Revoked invitations cannot be accepted",
          });
        }

        const acceptedAt = yield* nowDate;
        const accepted = new AcceptedInvitation({
          _tag: "AcceptedInvitation",
          acceptedAt,
          acceptedBy: input.acceptedIdentity,
          createdAt: current.createdAt,
          id: current.id,
          intent: current.intent,
          issuedBy: current.issuedBy,
        });

        yield* Ref.update(store, (existing) =>
          new Map(existing).set(input.invitationId, accepted)
        );

        return accepted;
      });

      const revoke = Effect.fn("Invitations.revoke")(function* (
        input: RevokeInvitationInput
      ) {
        const invitations = yield* Ref.get(store);
        const current = yield* Option.fromNullishOr(
          invitations.get(input.invitationId)
        ).pipe(
          Effect.fromOption,
          Effect.mapError(
            () =>
              new InvitationNotFound({
                invitationId: input.invitationId,
                message: `Invitation ${input.invitationId} was not found`,
              })
          )
        );

        if (current._tag === "AcceptedInvitation") {
          return yield* new InvitationConflict({
            message: "Accepted invitations cannot be revoked",
          });
        }

        if (current._tag === "RevokedInvitation") {
          return current;
        }

        const revokedAt = yield* nowDate;
        const revoked = new RevokedInvitation({
          _tag: "RevokedInvitation",
          createdAt: current.createdAt,
          id: current.id,
          intent: current.intent,
          issuedBy: current.issuedBy,
          revokedAt,
          revokedBy: input.revokedBy,
        });

        yield* Ref.update(store, (existing) =>
          new Map(existing).set(input.invitationId, revoked)
        );

        return revoked;
      });

      return {
        accept,
        get,
        issue,
        revoke,
      };
    })
  );
}
