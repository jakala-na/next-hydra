import { Schema } from "effect";

import { Actor } from "./actors";
import {
  AcceptedAuthIdentity,
  CommerceBusinessUnitId,
  InvitationId,
  RedactedEmail,
  RegistrationId,
} from "./identity";
import { CompanyMemberInvitationRole } from "./roles";

export class RegistrationApprovalIntent extends Schema.Class<RegistrationApprovalIntent>(
  "RegistrationApprovalIntent"
)({
  intent: Schema.Literal("registration_approval"),
  inviteeEmail: RedactedEmail,
  registrationId: RegistrationId,
  role: Schema.Literal("owner"),
}) {}

export class CompanyMemberIntent extends Schema.Class<CompanyMemberIntent>(
  "CompanyMemberIntent"
)({
  businessUnitId: CommerceBusinessUnitId,
  intent: Schema.Literal("company_member"),
  inviteeEmail: RedactedEmail,
  role: CompanyMemberInvitationRole,
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

/** The identity provider's lifecycle projection. Providers are not required to
 * retain the Registration context or actor that caused the invitation. */
export class InvitationDelivery extends Schema.Class<InvitationDelivery>(
  "InvitationDelivery"
)({
  acceptInvitationUrl: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  expiresAt: Schema.optional(Schema.Date),
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
    id: InvitationId,
    intent: InvitationIntent,
    issuedBy: Actor,
  }
) {}

export class RevokedInvitation extends Schema.TaggedClass<RevokedInvitation>()(
  "RevokedInvitation",
  {
    createdAt: Schema.Date,
    id: InvitationId,
    intent: InvitationIntent,
    issuedBy: Actor,
    revokedAt: Schema.Date,
    revokedBy: Actor,
  }
) {}

export const Invitation = Schema.Union([
  PendingInvitation,
  AcceptedInvitation,
  RevokedInvitation,
]);
export type Invitation = typeof Invitation.Type;

export class PendingRegistrationInvitation extends Schema.TaggedClass<PendingRegistrationInvitation>()(
  "PendingInvitation",
  {
    acceptInvitationUrl: Schema.optional(Schema.String),
    createdAt: Schema.Date,
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
    id: InvitationId,
    intent: RegistrationApprovalIntent,
    issuedBy: Actor,
  }
) {}

export class RevokedRegistrationInvitation extends Schema.TaggedClass<RevokedRegistrationInvitation>()(
  "RevokedInvitation",
  {
    createdAt: Schema.Date,
    id: InvitationId,
    intent: RegistrationApprovalIntent,
    issuedBy: Actor,
    revokedAt: Schema.Date,
    revokedBy: Actor,
  }
) {}

export const RegistrationInvitation = Schema.Union([
  PendingRegistrationInvitation,
  AcceptedRegistrationInvitation,
  RevokedRegistrationInvitation,
]);
export type RegistrationInvitation = typeof RegistrationInvitation.Type;
