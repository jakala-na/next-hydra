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

import type { Actor, CompanyActor } from "../domain/actors";
import { InvitationId } from "../domain/identity";
import type { AcceptedAuthIdentity, RegistrationId } from "../domain/identity";
import {
  AcceptedInvitation,
  ExpiredInvitation,
  InvitationDelivery,
  PendingInvitation,
  RevokedInvitation,
} from "../domain/invitations";
import type {
  CompanyMemberIntent,
  Invitation,
  RegistrationApprovalIntent,
} from "../domain/invitations";
import type { RegistrationInvitationIssueAttemptFailure } from "./registration-invitation-issue-attempt-failure";

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

export class InvitationExpired extends Schema.TaggedError<InvitationExpired>()(
  "InvitationExpired",
  {
    expiredAt: Schema.Date,
    invitationId: InvitationId,
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

export class InvitationIssueOutcomeUnknown extends Schema.TaggedError<InvitationIssueOutcomeUnknown>()(
  "InvitationIssueOutcomeUnknown",
  {
    cause: Schema.Defect(),
    message: Schema.String,
  }
) {}

export type InvitationIssueError =
  | InvitationConflict
  | InvitationExpired
  | InvitationIssueOutcomeUnknown
  | InvitationProviderFailure
  | RegistrationInvitationIssueAttemptFailure;
export type InvitationReadError =
  | InvitationNotFound
  | InvitationProviderFailure;
export type InvitationAcceptError =
  | InvitationNotFound
  | InvitationConflict
  | InvitationExpired
  | InvitationProviderFailure;
export type InvitationRevokeError =
  | InvitationNotFound
  | InvitationConflict
  | InvitationExpired
  | InvitationProviderFailure;

export interface RegistrationInvitationIssueInput {
  readonly intent: RegistrationApprovalIntent;
  readonly issuedBy: Actor;
}

export interface RegistrationInvitationAcceptanceInput {
  readonly invitationId: InvitationId;
  readonly acceptedIdentity: AcceptedAuthIdentity;
  readonly intent: RegistrationApprovalIntent;
  readonly issuedBy: Actor;
}

export interface RegistrationInvitationRevocationInput {
  readonly invitationId: InvitationId;
  readonly intent: RegistrationApprovalIntent;
  readonly issuedBy: Actor;
  readonly revokedBy: Actor;
}

export interface CompanyMemberInvitationIssueInput {
  readonly intent: CompanyMemberIntent;
  readonly issuedBy: CompanyActor;
}

export class InvitationDeliveries extends Context.Service<
  InvitationDeliveries,
  {
    readonly get: (
      invitationId: InvitationId
    ) => Effect.Effect<InvitationDelivery, InvitationReadError>;
  }
>()("@repo/registration/InvitationDeliveries") {}

export class RegistrationInvitations extends Context.Service<
  RegistrationInvitations,
  {
    readonly issue: (
      input: RegistrationInvitationIssueInput
    ) => Effect.Effect<PendingInvitation, InvitationIssueError>;
    readonly accept: (
      input: RegistrationInvitationAcceptanceInput
    ) => Effect.Effect<AcceptedInvitation, InvitationAcceptError>;
    readonly revoke: (
      input: RegistrationInvitationRevocationInput
    ) => Effect.Effect<RevokedInvitation, InvitationRevokeError>;
  }
>()("@repo/registration/RegistrationInvitations") {}

export class CompanyMemberInvitations extends Context.Service<
  CompanyMemberInvitations,
  {
    readonly issue: (
      input: CompanyMemberInvitationIssueInput
    ) => Effect.Effect<PendingInvitation, InvitationIssueError>;
  }
>()("@repo/registration/CompanyMemberInvitations") {}

type InvitationStore = ReadonlyMap<InvitationId, Invitation>;
type InvitationIssueInput =
  | RegistrationInvitationIssueInput
  | CompanyMemberInvitationIssueInput;

const nowDate = Clock.currentTimeMillis.pipe(
  Effect.map((time) => new Date(time))
);
const memoryInvitationLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1000;

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

const deliveryStatusFromInvitation = (invitation: Invitation) => {
  switch (invitation._tag) {
    case "PendingInvitation": {
      return "pending" as const;
    }
    case "AcceptedInvitation": {
      return "accepted" as const;
    }
    case "RevokedInvitation": {
      return "revoked" as const;
    }
    case "ExpiredInvitation": {
      return "expired" as const;
    }
    default: {
      return invitation satisfies never;
    }
  }
};

const deliveryUpdatedAtFromInvitation = (invitation: Invitation) => {
  switch (invitation._tag) {
    case "PendingInvitation": {
      return invitation.createdAt;
    }
    case "AcceptedInvitation": {
      return invitation.acceptedAt;
    }
    case "RevokedInvitation": {
      return invitation.revokedAt;
    }
    case "ExpiredInvitation": {
      return invitation.expiredAt;
    }
    default: {
      return invitation satisfies never;
    }
  }
};

const deliveryFromInvitation = (invitation: Invitation) => {
  const delivery = {
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    id: invitation.id,
    inviteeEmail: invitation.intent.inviteeEmail,
    status: deliveryStatusFromInvitation(invitation),
    updatedAt: deliveryUpdatedAtFromInvitation(invitation),
  };

  return invitation._tag === "PendingInvitation" &&
    invitation.acceptInvitationUrl
    ? new InvitationDelivery({
        ...delivery,
        acceptInvitationUrl: invitation.acceptInvitationUrl,
      })
    : new InvitationDelivery(delivery);
};

export const invitationCapabilitiesLayerMemory = Layer.effectContext(
  Effect.gen(function* () {
    const store = yield* Ref.make<InvitationStore>(new Map());

    const persistPendingInvitation = Effect.fn(
      "InvitationCapabilities.persistPending"
    )(function* (input: InvitationIssueInput) {
      const id = InvitationId.make(
        yield* Effect.sync(() => crypto.randomUUID())
      );
      const createdAt = yield* nowDate;
      const expiresAt = new Date(
        createdAt.getTime() + memoryInvitationLifetimeMilliseconds
      );
      const invitation = new PendingInvitation({
        _tag: "PendingInvitation",
        createdAt,
        expiresAt,
        id,
        intent: input.intent,
        issuedBy: input.issuedBy,
      });

      yield* Ref.update(store, (current) =>
        new Map(current).set(id, invitation)
      );

      return invitation;
    });

    const materializeExpiration = Effect.fn(
      "InvitationCapabilities.materializeExpiration"
    )(function* (invitation: Invitation) {
      if (invitation._tag !== "PendingInvitation") {
        return invitation;
      }

      const observedAt = yield* nowDate;
      if (observedAt < invitation.expiresAt) {
        return invitation;
      }

      const expired = new ExpiredInvitation({
        _tag: "ExpiredInvitation",
        createdAt: invitation.createdAt,
        expiredAt: invitation.expiresAt,
        expiresAt: invitation.expiresAt,
        id: invitation.id,
        intent: invitation.intent,
        issuedBy: invitation.issuedBy,
      });

      yield* Ref.update(store, (current) =>
        new Map(current).set(invitation.id, expired)
      );

      return expired;
    });

    const issueRegistration = Effect.fn("RegistrationInvitations.issue")(
      function* (input: RegistrationInvitationIssueInput) {
        const invitations = yield* Ref.get(store);
        const candidate = findRegistrationApprovalInvitation(
          invitations.values(),
          input.intent.registrationId
        );
        const existing = candidate
          ? yield* materializeExpiration(candidate)
          : undefined;

        if (existing) {
          if (existing._tag === "ExpiredInvitation") {
            return yield* new InvitationExpired({
              expiredAt: existing.expiredAt,
              invitationId: existing.id,
              message: `Registration invitation ${existing.id} has expired`,
            });
          }

          if (existing._tag !== "PendingInvitation") {
            return yield* new InvitationConflict({
              message: "Registration approval invitation already progressed",
            });
          }

          return existing;
        }

        return yield* persistPendingInvitation(input);
      }
    );

    const issueCompanyMember = Effect.fn("CompanyMemberInvitations.issue")(
      function* (input: CompanyMemberInvitationIssueInput) {
        const invitations = yield* Ref.get(store);
        const candidate = findPendingCompanyMemberInvitation(
          invitations.values(),
          input.intent
        );
        const existing = candidate
          ? yield* materializeExpiration(candidate)
          : undefined;

        if (existing?._tag === "PendingInvitation") {
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

        return yield* persistPendingInvitation(input);
      }
    );

    const get = Effect.fn("InvitationDeliveries.get")(function* (
      invitationId: InvitationId
    ) {
      const invitations = yield* Ref.get(store);
      const current = yield* Option.fromNullishOr(
        invitations.get(invitationId)
      ).pipe(
        Effect.fromOption,
        Effect.mapError(
          () =>
            new InvitationNotFound({
              invitationId,
              message: `Invitation ${invitationId} was not found`,
            })
        )
      );
      const invitation = yield* materializeExpiration(current);
      return deliveryFromInvitation(invitation);
    });

    const acceptRegistration = Effect.fn("RegistrationInvitations.accept")(
      function* (input: RegistrationInvitationAcceptanceInput) {
        const invitations = yield* Ref.get(store);
        const stored = yield* Option.fromNullishOr(
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
        const current = yield* materializeExpiration(stored);

        if (
          current.intent.intent !== "registration_approval" ||
          current.intent.registrationId !== input.intent.registrationId
        ) {
          return yield* new InvitationConflict({
            message: "Invitation is not for this Registration",
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

        if (current._tag === "ExpiredInvitation") {
          return yield* new InvitationExpired({
            expiredAt: current.expiredAt,
            invitationId: current.id,
            message: `Invitation ${current.id} has expired`,
          });
        }

        const acceptedAt = yield* nowDate;
        const accepted = new AcceptedInvitation({
          _tag: "AcceptedInvitation",
          acceptedAt,
          acceptedBy: input.acceptedIdentity,
          createdAt: current.createdAt,
          expiresAt: current.expiresAt,
          id: current.id,
          intent: current.intent,
          issuedBy: current.issuedBy,
        });

        yield* Ref.update(store, (existing) =>
          new Map(existing).set(input.invitationId, accepted)
        );

        return accepted;
      }
    );

    const revokeRegistration = Effect.fn("RegistrationInvitations.revoke")(
      function* (input: RegistrationInvitationRevocationInput) {
        const invitations = yield* Ref.get(store);
        const stored = yield* Option.fromNullishOr(
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
        const current = yield* materializeExpiration(stored);

        if (
          current.intent.intent !== "registration_approval" ||
          current.intent.registrationId !== input.intent.registrationId
        ) {
          return yield* new InvitationConflict({
            message: "Invitation is not for this Registration",
          });
        }

        if (current._tag === "AcceptedInvitation") {
          return yield* new InvitationConflict({
            message: "Accepted invitations cannot be revoked",
          });
        }

        if (current._tag === "RevokedInvitation") {
          return current;
        }

        if (current._tag === "ExpiredInvitation") {
          return yield* new InvitationExpired({
            expiredAt: current.expiredAt,
            invitationId: current.id,
            message: `Invitation ${current.id} has expired`,
          });
        }

        const revokedAt = yield* nowDate;
        const revoked = new RevokedInvitation({
          _tag: "RevokedInvitation",
          createdAt: current.createdAt,
          expiresAt: current.expiresAt,
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
      }
    );

    return Context.make(
      RegistrationInvitations,
      RegistrationInvitations.of({
        accept: acceptRegistration,
        issue: issueRegistration,
        revoke: revokeRegistration,
      })
    ).pipe(
      Context.add(
        CompanyMemberInvitations,
        CompanyMemberInvitations.of({ issue: issueCompanyMember })
      ),
      Context.add(InvitationDeliveries, InvitationDeliveries.of({ get }))
    );
  })
);
