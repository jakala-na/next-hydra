import { Schema } from "effect";
import { ApprovedDecision, RejectedDecision } from "./approval";
import { CommerceAccount } from "./commerce";
import {
  AddressLine,
  City,
  CompanyName,
  CountryCode,
  InvitationId,
  makePersistedRedacted,
  PhoneNumber,
  PostalCode,
  RedactedEmail,
  RedactedPersonName,
  Region,
  RegistrationId,
  VatId,
} from "./identity";

export const RedactedCompanyPhone = makePersistedRedacted(
  PhoneNumber,
  "companyPhone"
);
export type RedactedCompanyPhone = typeof RedactedCompanyPhone.Type;

export const RedactedVatId = makePersistedRedacted(VatId, "vatId");
export type RedactedVatId = typeof RedactedVatId.Type;

export const RedactedAddressLine = makePersistedRedacted(
  AddressLine,
  "addressLine"
);
export type RedactedAddressLine = typeof RedactedAddressLine.Type;

export const RedactedPostalCode = makePersistedRedacted(
  PostalCode,
  "postalCode"
);
export type RedactedPostalCode = typeof RedactedPostalCode.Type;

export const RedactedCity = makePersistedRedacted(City, "city");
export type RedactedCity = typeof RedactedCity.Type;

export const RedactedRegion = makePersistedRedacted(Region, "region");
export type RedactedRegion = typeof RedactedRegion.Type;

export class CompanyAddress extends Schema.Class<CompanyAddress>(
  "CompanyAddress"
)({
  streetName: RedactedAddressLine,
  additionalStreetInfo: Schema.optional(RedactedAddressLine),
  postalCode: RedactedPostalCode,
  city: RedactedCity,
  region: Schema.optional(RedactedRegion),
  country: CountryCode,
}) {}

export class CompanyRegistrationDetails extends Schema.Class<CompanyRegistrationDetails>(
  "CompanyRegistrationDetails"
)({
  companyName: CompanyName,
  companyPhone: Schema.optional(RedactedCompanyPhone),
  vatId: Schema.optional(RedactedVatId),
  contactFirstName: RedactedPersonName,
  contactLastName: RedactedPersonName,
  email: RedactedEmail,
  address: CompanyAddress,
}) {}

export const RegistrationStatus = Schema.Literals([
  "awaiting_approval",
  "approval_processing",
  "approved",
  "rejected",
]);
export type RegistrationStatus = typeof RegistrationStatus.Type;

export class AwaitingApprovalRegistration extends Schema.TaggedClass<AwaitingApprovalRegistration>()(
  "AwaitingApprovalRegistration",
  {
    status: Schema.Literal(RegistrationStatus.literals[0]),
    id: RegistrationId,
    details: CompanyRegistrationDetails,
    createdAt: Schema.Date,
    updatedAt: Schema.Date,
  }
) {}

export class ApprovalProcessingRegistration extends Schema.TaggedClass<ApprovalProcessingRegistration>()(
  "ApprovalProcessingRegistration",
  {
    status: Schema.Literal(RegistrationStatus.literals[1]),
    id: RegistrationId,
    details: CompanyRegistrationDetails,
    requestedDecision: Schema.Literals(["approved", "rejected"]),
    createdAt: Schema.Date,
    updatedAt: Schema.Date,
  }
) {}

export class ApprovedRegistration extends Schema.TaggedClass<ApprovedRegistration>()(
  "ApprovedRegistration",
  {
    status: Schema.Literal(RegistrationStatus.literals[2]),
    id: RegistrationId,
    details: CompanyRegistrationDetails,
    decision: ApprovedDecision,
    commerceAccount: CommerceAccount,
    invitationId: InvitationId,
    createdAt: Schema.Date,
    updatedAt: Schema.Date,
  }
) {}

export class RejectedRegistration extends Schema.TaggedClass<RejectedRegistration>()(
  "RejectedRegistration",
  {
    status: Schema.Literal(RegistrationStatus.literals[3]),
    id: RegistrationId,
    details: CompanyRegistrationDetails,
    decision: RejectedDecision,
    createdAt: Schema.Date,
    updatedAt: Schema.Date,
  }
) {}

export const Registration = Schema.Union([
  AwaitingApprovalRegistration,
  ApprovalProcessingRegistration,
  ApprovedRegistration,
  RejectedRegistration,
]);
export type Registration = typeof Registration.Type;
