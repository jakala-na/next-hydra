/* oxlint-disable max-classes-per-file -- Invitation lifecycle variants share one discriminated domain contract and must remain schema-visible together. */
import { Schema } from "effect";

import { Actor } from "./actors";
import {
  AcceptedAuthIdentity,
  AuthUserId,
  CompanyMemberInvitationId,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  Email,
  InvitationId,
  PersonName,
  RedactedEmail,
  RedactedPersonName,
  RegistrationId,
} from "./identity";
import { CompanyRoles } from "./roles";

export class RegistrationApprovalIntent extends Schema.Class<RegistrationApprovalIntent>(
  "RegistrationApprovalIntent"
)({
  intent: Schema.Literal("registration_approval"),
  inviteeEmail: RedactedEmail,
  registrationId: RegistrationId,
  roles: CompanyRoles,
}) {}

export class CompanyMemberIntent extends Schema.Class<CompanyMemberIntent>(
  "CompanyMemberIntent"
)({
  businessUnitId: CommerceBusinessUnitId,
  companyMemberInvitationId: CompanyMemberInvitationId,
  intent: Schema.Literal("company_member"),
  inviteeEmail: RedactedEmail,
  inviteeName: Schema.Struct({
    firstName: RedactedPersonName,
    lastName: RedactedPersonName,
  }),
  roles: CompanyRoles,
}) {}

export const InvitationIntent = Schema.Union([
  RegistrationApprovalIntent,
  CompanyMemberIntent,
]);
export type InvitationIntent = typeof InvitationIntent.Type;

export const InvitationDeliveryStatus = Schema.Literals([
  "pending",
  "accepted",
  "revoked",
  "expired",
]);
export type InvitationDeliveryStatus = typeof InvitationDeliveryStatus.Type;

export const InvitationLifecycleEvent = Schema.Union([
  Schema.Struct({
    acceptedAt: Schema.Date,
    acceptedIdentity: Schema.Struct({
      authUserId: AuthUserId,
      email: Email,
      firstName: Schema.optional(PersonName),
      lastName: Schema.optional(PersonName),
    }),
    event: Schema.Literal("accepted"),
  }),
  Schema.Struct({
    event: Schema.Literal("revoked"),
    revokedAt: Schema.Date,
  }),
]);
export type InvitationLifecycleEvent = typeof InvitationLifecycleEvent.Type;

/** The identity provider's lifecycle projection. Providers are not required to
 * retain the Registration context or actor that caused the invitation. */
export class InvitationDelivery extends Schema.Class<InvitationDelivery>(
  "InvitationDelivery"
)({
  acceptInvitationUrl: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  expiresAt: Schema.Date,
  id: InvitationId,
  inviteeEmail: RedactedEmail,
  status: InvitationDeliveryStatus,
  updatedAt: Schema.Date,
}) {}

export class PendingInvitation extends Schema.TaggedClass<PendingInvitation>()(
  "PendingInvitation",
  {
    acceptInvitationUrl: Schema.optional(Schema.String),
    createdAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: InvitationIntent,
    issuedBy: Actor,
  }
) {}

export class AcceptedInvitation extends Schema.TaggedClass<AcceptedInvitation>()(
  "AcceptedInvitation",
  {
    acceptedAt: Schema.Date,
    acceptedBy: AcceptedAuthIdentity,
    createdAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: InvitationIntent,
    issuedBy: Actor,
  }
) {}

export class RevokedInvitation extends Schema.TaggedClass<RevokedInvitation>()(
  "RevokedInvitation",
  {
    createdAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: InvitationIntent,
    issuedBy: Actor,
    revokedAt: Schema.Date,
    revokedBy: Actor,
  }
) {}

export class ExpiredInvitation extends Schema.TaggedClass<ExpiredInvitation>()(
  "ExpiredInvitation",
  {
    createdAt: Schema.Date,
    expiredAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: InvitationIntent,
    issuedBy: Actor,
  }
) {}

export const Invitation = Schema.Union([
  PendingInvitation,
  AcceptedInvitation,
  RevokedInvitation,
  ExpiredInvitation,
]);
export type Invitation = typeof Invitation.Type;

export class PendingCompanyMemberInvitation extends Schema.TaggedClass<PendingCompanyMemberInvitation>()(
  "PendingInvitation",
  {
    acceptInvitationUrl: Schema.optional(Schema.String),
    createdAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: CompanyMemberIntent,
    issuedBy: Actor,
  }
) {}

export class CompanyMemberProvisionedMembership extends Schema.Class<CompanyMemberProvisionedMembership>(
  "CompanyMemberProvisionedMembership"
)({
  customerId: CommerceCustomerId,
  provisionedAt: Schema.Date,
}) {}

export class AcceptedCompanyMemberInvitation extends Schema.TaggedClass<AcceptedCompanyMemberInvitation>()(
  "AcceptedInvitation",
  {
    acceptedAt: Schema.Date,
    acceptedBy: AcceptedAuthIdentity,
    createdAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: CompanyMemberIntent,
    issuedBy: Actor,
    provisionedMembership: Schema.optional(CompanyMemberProvisionedMembership),
  }
) {}

export class RevokedCompanyMemberInvitation extends Schema.TaggedClass<RevokedCompanyMemberInvitation>()(
  "RevokedInvitation",
  {
    createdAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: CompanyMemberIntent,
    issuedBy: Actor,
    replacementCompanyMemberInvitationId: Schema.optional(
      CompanyMemberInvitationId
    ),
    revokedAt: Schema.Date,
  }
) {}

export class ExpiredCompanyMemberInvitation extends Schema.TaggedClass<ExpiredCompanyMemberInvitation>()(
  "ExpiredInvitation",
  {
    createdAt: Schema.Date,
    expiredAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: CompanyMemberIntent,
    issuedBy: Actor,
    replacementCompanyMemberInvitationId: Schema.optional(
      CompanyMemberInvitationId
    ),
  }
) {}

export const CompanyMemberInvitation = Schema.Union([
  PendingCompanyMemberInvitation,
  AcceptedCompanyMemberInvitation,
  RevokedCompanyMemberInvitation,
  ExpiredCompanyMemberInvitation,
]);
export type CompanyMemberInvitation = typeof CompanyMemberInvitation.Type;

export class PendingRegistrationInvitation extends Schema.TaggedClass<PendingRegistrationInvitation>()(
  "PendingInvitation",
  {
    acceptInvitationUrl: Schema.optional(Schema.String),
    createdAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: RegistrationApprovalIntent,
    issuedBy: Actor,
  }
) {}

export class AcceptedRegistrationInvitation extends Schema.TaggedClass<AcceptedRegistrationInvitation>()(
  "AcceptedInvitation",
  {
    acceptedAt: Schema.Date,
    acceptedBy: AcceptedAuthIdentity,
    createdAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: RegistrationApprovalIntent,
    issuedBy: Actor,
  }
) {}

export class RevokedRegistrationInvitation extends Schema.TaggedClass<RevokedRegistrationInvitation>()(
  "RevokedInvitation",
  {
    createdAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: RegistrationApprovalIntent,
    issuedBy: Actor,
    revokedAt: Schema.Date,
    revokedBy: Actor,
  }
) {}

export class ExpiredRegistrationInvitation extends Schema.TaggedClass<ExpiredRegistrationInvitation>()(
  "ExpiredInvitation",
  {
    createdAt: Schema.Date,
    expiredAt: Schema.Date,
    expiresAt: Schema.Date,
    id: InvitationId,
    intent: RegistrationApprovalIntent,
    issuedBy: Actor,
  }
) {}

export const RegistrationInvitation = Schema.Union([
  PendingRegistrationInvitation,
  AcceptedRegistrationInvitation,
  RevokedRegistrationInvitation,
  ExpiredRegistrationInvitation,
]);
export type RegistrationInvitation = typeof RegistrationInvitation.Type;
