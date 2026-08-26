import type { CommerceAccountUnavailable } from "@repo/commerce/services/commerce-accounts";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { Clock, DateTime, Effect, Random, Redacted } from "effect";

import type { CompanyActor } from "../domain/actors";
import { CompanyMemberInvitationId } from "../domain/identity";
import type {
  CompanyMemberInvitationId as CompanyMemberInvitationIdType,
  RedactedEmail,
  RedactedPersonName,
} from "../domain/identity";
import {
  CompanyMemberIntent,
  PendingCompanyMemberInvitation,
} from "../domain/invitations";
import type {
  CompanyMemberInvitation as CompanyMemberInvitationType,
  RevokedCompanyMemberInvitation,
} from "../domain/invitations";
import type { CompanyRoles } from "../domain/roles";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import type { InvitationPolicyError } from "../services/company-invitation-policy";
import { CompanyMemberInvitationRecords } from "../services/company-member-invitation-records";
import type {
  CompanyMemberInvitationNotFound,
  CompanyMemberInvitationPersistenceFailure,
  CompanyMemberInvitationRecordConflict,
} from "../services/company-member-invitation-records";
import {
  CompanyMemberInvitations,
  InvitationConflict,
  InvitationDeliveries,
  InvitationIssueOutcomeUnknown,
} from "../services/invitations";
import type {
  CompanyMemberInvitationIssueError,
  CompanyMemberInvitationRevokeError,
} from "../services/invitations";

export interface IssueCompanyMemberInviteInput {
  readonly actor: CompanyActor;
  readonly inviteeEmail: RedactedEmail;
  readonly inviteeName: {
    readonly firstName: RedactedPersonName;
    readonly lastName: RedactedPersonName;
  };
  readonly roles: CompanyRoles;
}

export interface RevokeCompanyMemberInviteInput {
  readonly actor: CompanyActor;
  readonly companyMemberInvitationId: CompanyMemberInvitationIdType;
}

export interface ListCompanyMemberInvitationsInput {
  readonly actor: CompanyActor;
}

export interface ReissueCompanyMemberInviteInput {
  readonly actor: CompanyActor;
  readonly companyMemberInvitationId: CompanyMemberInvitationIdType;
}

export type ListCompanyMemberInvitationsError =
  | CompanyMemberInvitationNotFound
  | CompanyMemberInvitationPersistenceFailure
  | CompanyMemberInvitationRecordConflict
  | InvitationPolicyError;

export type ReissueCompanyMemberInviteError =
  | CommerceAccountUnavailable
  | CompanyMemberInvitationNotFound
  | CompanyMemberInvitationPersistenceFailure
  | CompanyMemberInvitationRecordConflict
  | CompanyMemberInvitationIssueError
  | InvitationPolicyError;

export type RevokeCompanyMemberInviteError =
  | CompanyMemberInvitationNotFound
  | CompanyMemberInvitationPersistenceFailure
  | CompanyMemberInvitationRecordConflict
  | CompanyMemberInvitationRevokeError
  | InvitationPolicyError;

const materializeExpiration = (
  records: CompanyMemberInvitationRecords["Service"],
  invitation: CompanyMemberInvitationType,
  now: Date
) =>
  invitation._tag === "PendingInvitation" &&
  invitation.expiresAt.getTime() <= now.getTime()
    ? records.markExpired({
        companyMemberInvitationId: invitation.intent.companyMemberInvitationId,
        expiredAt: invitation.expiresAt,
      })
    : Effect.succeed(invitation);

const makeCompanyMemberInvitationId = Effect.gen(function* () {
  const issuedAt = yield* Clock.currentTimeMillis;
  const entropy = Math.abs(yield* Random.nextInt);
  return CompanyMemberInvitationId.make(
    `company-member-invitation-${issuedAt}-${entropy}`
  );
});

const issueCompanyMemberInviteWithId = (
  input: IssueCompanyMemberInviteInput,
  companyMemberInvitationId: CompanyMemberInvitationIdType,
  replacesInvitationId?: CompanyMemberInvitationType["id"]
) =>
  Effect.gen(function* () {
    const commerceAccounts = yield* CommerceAccounts;
    const policy = yield* CompanyInvitationPolicy;
    const invitations = yield* CompanyMemberInvitations;
    const records = yield* CompanyMemberInvitationRecords;

    yield* policy.authorizeIssueInvite({
      actor: input.actor,
      inviteeEmail: input.inviteeEmail,
      roles: input.roles,
    });

    if (yield* commerceAccounts.hasCustomerWithEmail(input.inviteeEmail)) {
      return yield* new InvitationConflict({
        message: "A Commerce customer already exists for the invited email",
      });
    }

    const intent = new CompanyMemberIntent({
      businessUnitId: input.actor.businessUnitId,
      companyMemberInvitationId,
      intent: "company_member",
      inviteeEmail: input.inviteeEmail,
      inviteeName: input.inviteeName,
      roles: input.roles,
    });
    const issueInput =
      replacesInvitationId === undefined
        ? { intent, issuedBy: input.actor }
        : { intent, issuedBy: input.actor, replacesInvitationId };
    const delivered = yield* invitations.issue(issueInput);
    const invitation = new PendingCompanyMemberInvitation({
      _tag: "PendingInvitation",
      acceptInvitationUrl: delivered.acceptInvitationUrl,
      createdAt: delivered.createdAt,
      expiresAt: delivered.expiresAt,
      id: delivered.id,
      intent,
      issuedBy: input.actor,
    });

    return yield* records.recordIssued(invitation).pipe(
      Effect.mapError(
        (error: CompanyMemberInvitationPersistenceFailure) =>
          new InvitationIssueOutcomeUnknown({
            cause: error,
            message: `Invitation ${delivered.id} was issued but its company-member context could not be persisted`,
          })
      )
    );
  });

export const issueCompanyMemberInvite = (
  input: IssueCompanyMemberInviteInput
): Effect.Effect<
  PendingCompanyMemberInvitation,
  | CommerceAccountUnavailable
  | InvitationPolicyError
  | CompanyMemberInvitationIssueError,
  | CompanyInvitationPolicy
  | CompanyMemberInvitationRecords
  | CompanyMemberInvitations
  | CommerceAccounts
> =>
  Effect.gen(function* () {
    return yield* issueCompanyMemberInviteWithId(
      input,
      yield* makeCompanyMemberInvitationId
    );
  });

export const revokeCompanyMemberInvite = (
  input: RevokeCompanyMemberInviteInput
): Effect.Effect<
  RevokedCompanyMemberInvitation,
  RevokeCompanyMemberInviteError,
  | CompanyInvitationPolicy
  | CompanyMemberInvitationRecords
  | CompanyMemberInvitations
> =>
  Effect.gen(function* () {
    const policy = yield* CompanyInvitationPolicy;
    const records = yield* CompanyMemberInvitationRecords;
    const invitations = yield* CompanyMemberInvitations;
    const stored = yield* records.getById(input.companyMemberInvitationId);
    const current = yield* materializeExpiration(
      records,
      stored,
      DateTime.toDateUtc(yield* DateTime.now)
    );

    yield* policy.authorizeRevokeInvite({
      actor: input.actor,
      intent: current.intent,
    });

    if (current._tag === "RevokedInvitation") {
      return current;
    }

    if (current._tag === "AcceptedInvitation") {
      return yield* new InvitationConflict({
        message: "An accepted company member invitation cannot be revoked",
      });
    }

    if (current._tag === "ExpiredInvitation") {
      return yield* new InvitationConflict({
        message:
          "An expired company member invitation cannot be cancelled; send a new invitation instead",
      });
    }

    const revoked = yield* invitations.revoke({
      intent: current.intent,
      invitationId: current.id,
      issuedBy: current.issuedBy,
      revokedBy: input.actor,
    });

    return yield* records.markRevoked({
      companyMemberInvitationId: current.intent.companyMemberInvitationId,
      revokedAt: revoked.revokedAt,
    });
  });

export const listCompanyMemberInvitations = (
  input: ListCompanyMemberInvitationsInput
): Effect.Effect<
  readonly CompanyMemberInvitationType[],
  ListCompanyMemberInvitationsError,
  CompanyInvitationPolicy | CompanyMemberInvitationRecords
> =>
  Effect.gen(function* () {
    const policy = yield* CompanyInvitationPolicy;
    const records = yield* CompanyMemberInvitationRecords;

    yield* policy.authorizeManageCompany({
      actor: input.actor,
      businessUnitId: input.actor.businessUnitId,
    });

    const now = DateTime.toDateUtc(yield* DateTime.now);
    const invitations = yield* records.listByBusinessUnit(
      input.actor.businessUnitId
    );

    return yield* Effect.all(
      invitations.map((invitation) =>
        materializeExpiration(records, invitation, now)
      )
    );
  });

const currentInvitationsByEmail = (
  invitations: readonly CompanyMemberInvitationType[]
) => {
  const invitationIds = new Set(
    invitations.map(({ intent }) => String(intent.companyMemberInvitationId))
  );
  const candidates = invitations.filter(
    (invitation) =>
      !(
        invitation._tag === "AcceptedInvitation" &&
        invitation.provisionedMembership !== undefined
      ) &&
      ((invitation._tag !== "ExpiredInvitation" &&
        invitation._tag !== "RevokedInvitation") ||
        invitation.replacementCompanyMemberInvitationId === undefined ||
        !invitationIds.has(
          String(invitation.replacementCompanyMemberInvitationId)
        ))
  );
  const latest = new Map<string, CompanyMemberInvitationType>();

  for (const invitation of candidates) {
    const email = Redacted.value(invitation.intent.inviteeEmail)
      .trim()
      .toLowerCase();
    const current = latest.get(email);
    if (
      current === undefined ||
      invitation.createdAt.getTime() > current.createdAt.getTime() ||
      (invitation.createdAt.getTime() === current.createdAt.getTime() &&
        String(invitation.intent.companyMemberInvitationId) >
          String(current.intent.companyMemberInvitationId))
    ) {
      latest.set(email, invitation);
    }
  }

  return [...latest.values()];
};

export const listCurrentCompanyMemberInvitations = (
  input: ListCompanyMemberInvitationsInput
): Effect.Effect<
  readonly CompanyMemberInvitationType[],
  ListCompanyMemberInvitationsError,
  CompanyInvitationPolicy | CompanyMemberInvitationRecords
> =>
  listCompanyMemberInvitations(input).pipe(
    Effect.map(currentInvitationsByEmail)
  );

export const reissueCompanyMemberInvite = (
  input: ReissueCompanyMemberInviteInput
): Effect.Effect<
  PendingCompanyMemberInvitation,
  ReissueCompanyMemberInviteError,
  | CommerceAccounts
  | CompanyInvitationPolicy
  | CompanyMemberInvitationRecords
  | CompanyMemberInvitations
  | InvitationDeliveries
> =>
  Effect.gen(function* () {
    const policy = yield* CompanyInvitationPolicy;
    const records = yield* CompanyMemberInvitationRecords;
    const deliveries = yield* InvitationDeliveries;
    const stored = yield* records.getById(input.companyMemberInvitationId);
    const current = yield* materializeExpiration(
      records,
      stored,
      DateTime.toDateUtc(yield* DateTime.now)
    );

    yield* policy.authorizeManageCompany({
      actor: input.actor,
      businessUnitId: current.intent.businessUnitId,
    });

    if (
      current._tag !== "ExpiredInvitation" &&
      current._tag !== "RevokedInvitation"
    ) {
      return yield* new InvitationConflict({
        message:
          current._tag === "AcceptedInvitation"
            ? "An accepted company member invitation cannot be reissued"
            : "A pending company member invitation cannot be reissued",
      });
    }

    if (current._tag === "ExpiredInvitation") {
      const delivery = yield* deliveries.get(current.id).pipe(
        Effect.map((value) => ({ found: true as const, value })),
        Effect.catchTag("InvitationNotFound", () =>
          Effect.succeed({ found: false as const })
        )
      );
      if (
        delivery.found &&
        delivery.value.status !== "expired" &&
        delivery.value.status !== "revoked"
      ) {
        return yield* new InvitationConflict({
          message:
            delivery.value.status === "accepted"
              ? "The invitation was accepted and is awaiting company provisioning"
              : "The invitation is still active at the identity provider",
        });
      }
    }

    const requestedReplacementId = yield* makeCompanyMemberInvitationId;
    const claimed = yield* records.claimReissue({
      companyMemberInvitationId: current.intent.companyMemberInvitationId,
      replacementCompanyMemberInvitationId: requestedReplacementId,
    });
    const replacementId = claimed.replacementCompanyMemberInvitationId;
    if (replacementId === undefined) {
      return yield* Effect.die(
        new Error("Reissue claim did not retain its replacement invitation ID")
      );
    }

    if (replacementId !== requestedReplacementId) {
      const replacement = yield* records.getById(replacementId).pipe(
        Effect.catchTag("CompanyMemberInvitationNotFound", (error) =>
          Effect.fail(
            new InvitationIssueOutcomeUnknown({
              cause: error,
              message:
                "A company member invitation reissue is already in progress",
            })
          )
        )
      );
      if (replacement._tag === "PendingInvitation") {
        return replacement;
      }
      return yield* new InvitationConflict({
        message: "The replacement invitation is no longer pending",
      });
    }

    return yield* issueCompanyMemberInviteWithId(
      {
        actor: input.actor,
        inviteeEmail: current.intent.inviteeEmail,
        inviteeName: current.intent.inviteeName,
        roles: current.intent.roles,
      },
      replacementId,
      current.id
    ).pipe(
      Effect.catch((error) => {
        if (error._tag === "InvitationIssueOutcomeUnknown") {
          return Effect.fail(error);
        }

        return records
          .releaseReissueClaim({
            companyMemberInvitationId: current.intent.companyMemberInvitationId,
            replacementCompanyMemberInvitationId: replacementId,
          })
          .pipe(
            Effect.mapError(
              (releaseError) =>
                new InvitationIssueOutcomeUnknown({
                  cause: releaseError,
                  message:
                    "The invitation was not issued, but its reissue claim could not be released",
                })
            ),
            Effect.andThen(Effect.fail(error))
          );
      })
    );
  });
