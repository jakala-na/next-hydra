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
  registrationId: RegistrationId,
  inviteeEmail: RedactedEmail,
  role: Schema.Literal("owner"),
}) {}

export class CompanyMemberIntent extends Schema.Class<CompanyMemberIntent>(
  "CompanyMemberIntent"
)({
  intent: Schema.Literal("company_member"),
  businessUnitId: CommerceBusinessUnitId,
  inviteeEmail: RedactedEmail,
  role: CompanyMemberInvitationRole,
}) {}

export class ProviderInvitationIntent extends Schema.Class<ProviderInvitationIntent>(
  "ProviderInvitationIntent"
)({
  intent: Schema.Literal("provider_managed"),
  inviteeEmail: RedactedEmail,
  role: Schema.String,
}) {}

export const InvitationIntent = Schema.Union([
  RegistrationApprovalIntent,
  CompanyMemberIntent,
  ProviderInvitationIntent,
]);
export type InvitationIntent = typeof InvitationIntent.Type;

export class PendingInvitation extends Schema.TaggedClass<PendingInvitation>()(
  "PendingInvitation",
  {
    id: InvitationId,
    intent: InvitationIntent,
    issuedBy: Actor,
    createdAt: Schema.Date,
    acceptInvitationUrl: Schema.optional(Schema.String),
  }
) {}

export class AcceptedInvitation extends Schema.TaggedClass<AcceptedInvitation>()(
  "AcceptedInvitation",
  {
    id: InvitationId,
    intent: InvitationIntent,
    issuedBy: Actor,
    acceptedBy: AcceptedAuthIdentity,
    createdAt: Schema.Date,
    acceptedAt: Schema.Date,
  }
) {}

export class RevokedInvitation extends Schema.TaggedClass<RevokedInvitation>()(
  "RevokedInvitation",
  {
    id: InvitationId,
    intent: InvitationIntent,
    issuedBy: Actor,
    revokedBy: Actor,
    createdAt: Schema.Date,
    revokedAt: Schema.Date,
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
    id: InvitationId,
    intent: RegistrationApprovalIntent,
    issuedBy: Actor,
    createdAt: Schema.Date,
    acceptInvitationUrl: Schema.optional(Schema.String),
  }
) {}

export class AcceptedRegistrationInvitation extends Schema.TaggedClass<AcceptedRegistrationInvitation>()(
  "AcceptedInvitation",
  {
    id: InvitationId,
    intent: RegistrationApprovalIntent,
    issuedBy: Actor,
    acceptedBy: AcceptedAuthIdentity,
    createdAt: Schema.Date,
    acceptedAt: Schema.Date,
  }
) {}

export class RevokedRegistrationInvitation extends Schema.TaggedClass<RevokedRegistrationInvitation>()(
  "RevokedInvitation",
  {
    id: InvitationId,
    intent: RegistrationApprovalIntent,
    issuedBy: Actor,
    revokedBy: Actor,
    createdAt: Schema.Date,
    revokedAt: Schema.Date,
  }
) {}

export const RegistrationInvitation = Schema.Union([
  PendingRegistrationInvitation,
  AcceptedRegistrationInvitation,
  RevokedRegistrationInvitation,
]);
export type RegistrationInvitation = typeof RegistrationInvitation.Type;
