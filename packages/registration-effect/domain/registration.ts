import { Schema } from "effect";
import { ApprovedDecision, RejectedDecision } from "./approval";
import { CommerceAccount } from "./commerce";
import {
  AddressLine,
  City,
  CompanyName,
  CountryCode,
  PhoneNumber,
  PostalCode,
  RedactedEmail,
  RedactedPersonName,
  Region,
  RegistrationId,
  VatId,
} from "./identity";
import { RegistrationInvitation } from "./invitations";

export const RedactedCompanyPhone = Schema.Redacted(PhoneNumber, {
  label: "companyPhone",
});
export type RedactedCompanyPhone = typeof RedactedCompanyPhone.Type;

export const RedactedVatId = Schema.Redacted(VatId, {
  label: "vatId",
});
export type RedactedVatId = typeof RedactedVatId.Type;

export const RedactedAddressLine = Schema.Redacted(AddressLine, {
  label: "addressLine",
});
export type RedactedAddressLine = typeof RedactedAddressLine.Type;

export const RedactedPostalCode = Schema.Redacted(PostalCode, {
  label: "postalCode",
});
export type RedactedPostalCode = typeof RedactedPostalCode.Type;

export const RedactedCity = Schema.Redacted(City, {
  label: "city",
});
export type RedactedCity = typeof RedactedCity.Type;

export const RedactedRegion = Schema.Redacted(Region, {
  label: "region",
});
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

export class AwaitingApprovalRegistration extends Schema.TaggedClass<AwaitingApprovalRegistration>()(
  "AwaitingApprovalRegistration",
  {
    id: RegistrationId,
    details: CompanyRegistrationDetails,
    createdAt: Schema.Date,
    updatedAt: Schema.Date,
  }
) {}

export class ApprovedRegistration extends Schema.TaggedClass<ApprovedRegistration>()(
  "ApprovedRegistration",
  {
    id: RegistrationId,
    details: CompanyRegistrationDetails,
    decision: ApprovedDecision,
    commerceAccount: CommerceAccount,
    invitation: RegistrationInvitation,
    createdAt: Schema.Date,
    updatedAt: Schema.Date,
  }
) {}

export class RejectedRegistration extends Schema.TaggedClass<RejectedRegistration>()(
  "RejectedRegistration",
  {
    id: RegistrationId,
    details: CompanyRegistrationDetails,
    decision: RejectedDecision,
    createdAt: Schema.Date,
    updatedAt: Schema.Date,
  }
) {}

export const Registration = Schema.Union([
  AwaitingApprovalRegistration,
  ApprovedRegistration,
  RejectedRegistration,
]);
export type Registration = typeof Registration.Type;
