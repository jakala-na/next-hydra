import type { CommerceAccountUnavailable } from "@repo/commerce/services/commerce-accounts";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { Clock, Effect, Random } from "effect";

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
import type { RevokedCompanyMemberInvitation } from "../domain/invitations";
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

export type RevokeCompanyMemberInviteError =
  | CompanyMemberInvitationNotFound
  | CompanyMemberInvitationPersistenceFailure
  | CompanyMemberInvitationRecordConflict
  | CompanyMemberInvitationRevokeError
  | InvitationPolicyError;

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

    const issuedAt = yield* Clock.currentTimeMillis;
    const entropy = Math.abs(yield* Random.nextInt);
    const companyMemberInvitationId = CompanyMemberInvitationId.make(
      `company-member-invitation-${issuedAt}-${entropy}`
    );
    const intent = new CompanyMemberIntent({
      businessUnitId: input.actor.businessUnitId,
      companyMemberInvitationId,
      intent: "company_member",
      inviteeEmail: input.inviteeEmail,
      inviteeName: input.inviteeName,
      roles: input.roles,
    });
    const delivered = yield* invitations.issue({
      intent,
      issuedBy: input.actor,
    });
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
    const current = yield* records.getById(input.companyMemberInvitationId);

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
