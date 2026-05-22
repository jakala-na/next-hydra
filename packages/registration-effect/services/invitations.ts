import {
  Clock,
  Context,
  Effect,
  Layer,
  Option,
  Random,
  Redacted,
  Ref,
  Schema,
} from "effect";
import type { Actor } from "../domain/actors";
import {
  type AcceptedAuthIdentity,
  InvitationId,
  type RegistrationId,
} from "../domain/identity";
import {
  AcceptedInvitation,
  type CompanyMemberIntent,
  type Invitation,
  type InvitationIntent,
  PendingInvitation,
  type RegistrationApprovalIntent,
  RevokedInvitation,
} from "../domain/invitations";

export class InvitationNotFound extends Schema.TaggedErrorClass<InvitationNotFound>()(
  "InvitationNotFound",
  {
    invitationId: InvitationId,
  }
) {}

export class InvitationConflict extends Schema.TaggedErrorClass<InvitationConflict>()(
  "InvitationConflict",
  {
    reason: Schema.String,
  }
) {}

export class InvitationProviderFailure extends Schema.TaggedErrorClass<InvitationProviderFailure>()(
  "InvitationProviderFailure",
  {
    operation: Schema.Literals(["issue", "read", "accept", "revoke"]),
    cause: Schema.Defect,
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
>()("@repo/registration-effect/Invitations") {
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
                reason: "Registration approval invitation already progressed",
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
                reason:
                  "Pending company invitation already exists with a different role",
              });
            }

            return existing;
          }
        }

        const id = InvitationId.make(yield* Random.nextUUIDv4);
        const createdAt = yield* nowDate;
        const invitation = new PendingInvitation({
          _tag: "PendingInvitation",
          id,
          intent: input.intent,
          issuedBy: input.issuedBy,
          createdAt,
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
          Effect.mapError(() => new InvitationNotFound({ invitationId }))
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
            () => new InvitationNotFound({ invitationId: input.invitationId })
          )
        );

        if (current.intent.intent !== input.expectedIntent) {
          return yield* new InvitationConflict({
            reason: `Invitation is not for ${input.expectedIntent}`,
          });
        }

        if (current._tag === "AcceptedInvitation") {
          if (
            current.acceptedBy.authUserId === input.acceptedIdentity.authUserId
          ) {
            return current;
          }

          return yield* new InvitationConflict({
            reason: "Invitation was accepted by a different auth user",
          });
        }

        if (current._tag === "RevokedInvitation") {
          return yield* new InvitationConflict({
            reason: "Revoked invitations cannot be accepted",
          });
        }

        const acceptedAt = yield* nowDate;
        const accepted = new AcceptedInvitation({
          _tag: "AcceptedInvitation",
          id: current.id,
          intent: current.intent,
          issuedBy: current.issuedBy,
          acceptedBy: input.acceptedIdentity,
          createdAt: current.createdAt,
          acceptedAt,
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
            () => new InvitationNotFound({ invitationId: input.invitationId })
          )
        );

        if (current._tag === "AcceptedInvitation") {
          return yield* new InvitationConflict({
            reason: "Accepted invitations cannot be revoked",
          });
        }

        if (current._tag === "RevokedInvitation") {
          return current;
        }

        const revokedAt = yield* nowDate;
        const revoked = new RevokedInvitation({
          _tag: "RevokedInvitation",
          id: current.id,
          intent: current.intent,
          issuedBy: current.issuedBy,
          revokedBy: input.revokedBy,
          createdAt: current.createdAt,
          revokedAt,
        });

        yield* Ref.update(store, (existing) =>
          new Map(existing).set(input.invitationId, revoked)
        );

        return revoked;
      });

      return {
        issue,
        get,
        accept,
        revoke,
      };
    })
  );
}
