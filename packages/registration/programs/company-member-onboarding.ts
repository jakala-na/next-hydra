import type { InvitationProviderFailure } from "@repo/auth-contract/invitations";
import { CommerceAssociateMembership } from "@repo/commerce/domain/commerce-account";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import type {
  CommerceAccountUnavailable,
  CommerceCustomerEmailConflict,
} from "@repo/commerce/services/commerce-accounts";
import { DateTime, Effect, Redacted, Schema } from "effect";

import {
  AcceptedAuthIdentity,
  CompanyMemberInvitationId,
  InvitationId,
} from "../domain/identity";
import type { AuthUserId, Email, PersonName } from "../domain/identity";
import { CompanyMemberIdentityProjection } from "../services/company-member-identity-projection";
import { CompanyMemberInvitationRecords } from "../services/company-member-invitation-records";
import type {
  CompanyMemberInvitationNotFound,
  CompanyMemberInvitationPersistenceFailure,
  CompanyMemberInvitationRecordConflict,
} from "../services/company-member-invitation-records";
import { InvitationConflict, InvitationExpired } from "../services/invitations";

export const CompanyMemberInvitationAcceptanceReference = Schema.Union([
  Schema.Struct({
    companyMemberInvitationId: CompanyMemberInvitationId,
    referenceType: Schema.Literal("company_member_invitation"),
  }),
  Schema.Struct({
    providerInvitationId: InvitationId,
    referenceType: Schema.Literal("provider_invitation"),
  }),
]);
export type CompanyMemberInvitationAcceptanceReference =
  typeof CompanyMemberInvitationAcceptanceReference.Type;

export interface AcceptCompanyMemberInvitationInput {
  readonly acceptedAt: Date;
  readonly acceptedIdentity: {
    readonly authUserId: AuthUserId;
    readonly email: Email;
    readonly firstName?: PersonName;
    readonly lastName?: PersonName;
  };
  readonly reference: CompanyMemberInvitationAcceptanceReference;
}

export type AcceptCompanyMemberInvitationError =
  | CommerceAccountUnavailable
  | CommerceCustomerEmailConflict
  | CompanyMemberInvitationNotFound
  | CompanyMemberInvitationPersistenceFailure
  | CompanyMemberInvitationRecordConflict
  | InvitationConflict
  | InvitationExpired
  | InvitationProviderFailure;

const normalizedEmail = (email: Redacted.Redacted) =>
  Redacted.value(email).trim().toLowerCase();

export const acceptCompanyMemberInvitation = (
  input: AcceptCompanyMemberInvitationInput
): Effect.Effect<
  CommerceAssociateMembership,
  AcceptCompanyMemberInvitationError,
  | CompanyMemberIdentityProjection
  | CompanyMemberInvitationRecords
  | CommerceAccounts
> =>
  Effect.gen(function* () {
    const records = yield* CompanyMemberInvitationRecords;
    const commerceAccounts = yield* CommerceAccounts;
    const identityProjection = yield* CompanyMemberIdentityProjection;
    const invitation =
      input.reference.referenceType === "company_member_invitation"
        ? yield* records.getById(input.reference.companyMemberInvitationId)
        : yield* records.getByProviderInvitationId(
            input.reference.providerInvitationId
          );
    const acceptedIdentity = new AcceptedAuthIdentity({
      authUserId: input.acceptedIdentity.authUserId,
      email: Redacted.make(input.acceptedIdentity.email, { label: "email" }),
      firstName: Redacted.make(
        input.acceptedIdentity.firstName ??
          Redacted.value(invitation.intent.inviteeName.firstName),
        { label: "personName" }
      ),
      lastName: Redacted.make(
        input.acceptedIdentity.lastName ??
          Redacted.value(invitation.intent.inviteeName.lastName),
        { label: "personName" }
      ),
    });

    if (
      normalizedEmail(invitation.intent.inviteeEmail) !==
      normalizedEmail(acceptedIdentity.email)
    ) {
      return yield* new InvitationConflict({
        message: "Accepted identity does not match the invited email address",
      });
    }

    if (
      invitation._tag === "AcceptedInvitation" &&
      invitation.acceptedBy.authUserId !== acceptedIdentity.authUserId
    ) {
      return yield* new InvitationConflict({
        message: "Company member invitation was accepted by another user",
      });
    }

    if (
      (invitation._tag === "PendingInvitation" ||
        invitation._tag === "ExpiredInvitation") &&
      invitation.expiresAt.getTime() <= input.acceptedAt.getTime()
    ) {
      if (invitation._tag === "PendingInvitation") {
        yield* records.markExpired({
          companyMemberInvitationId:
            invitation.intent.companyMemberInvitationId,
          expiredAt: invitation.expiresAt,
        });
      }

      return yield* new InvitationExpired({
        expiredAt: invitation.expiresAt,
        invitationId: invitation.id,
        message: `Company member invitation ${invitation.id} has expired`,
      });
    }

    if (
      (invitation._tag === "PendingInvitation" ||
        invitation._tag === "ExpiredInvitation") &&
      (yield* commerceAccounts.hasCustomerWithEmail(
        invitation.intent.inviteeEmail
      ))
    ) {
      return yield* new InvitationConflict({
        message: "A Commerce customer already exists for the invited email",
      });
    }

    const accepted = yield* records.markAccepted({
      acceptedAt: input.acceptedAt,
      acceptedIdentity,
      companyMemberInvitationId: invitation.intent.companyMemberInvitationId,
    });

    if (accepted.provisionedMembership !== undefined) {
      return new CommerceAssociateMembership({
        authUserId: accepted.acceptedBy.authUserId,
        businessUnitId: accepted.intent.businessUnitId,
        customerId: accepted.provisionedMembership.customerId,
        roles: accepted.intent.roles,
      });
    }

    yield* identityProjection.projectAcceptedInvitation({
      acceptedIdentity: accepted.acceptedBy,
      intent: invitation.intent,
    });

    const membership = yield* commerceAccounts.addAssociate({
      acceptedIdentity: accepted.acceptedBy,
      businessUnitId: invitation.intent.businessUnitId,
      roles: invitation.intent.roles,
    });

    yield* records.markProvisioned({
      companyMemberInvitationId: invitation.intent.companyMemberInvitationId,
      customerId: membership.customerId,
      provisionedAt: DateTime.toDateUtc(yield* DateTime.now),
    });

    return membership;
  });
