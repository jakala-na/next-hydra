import { CommerceAccount } from "@repo/commerce/domain/commerce-account";
import { StoreKey } from "@repo/commerce/store";
import { Schema } from "effect";

import { ApprovedDecision, RejectedDecision } from "./approval";
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
  additionalStreetInfo: Schema.optional(RedactedAddressLine),
  city: RedactedCity,
  country: CountryCode,
  postalCode: RedactedPostalCode,
  region: Schema.optional(RedactedRegion),
  streetName: RedactedAddressLine,
}) {}

export class CompanyRegistrationDetails extends Schema.Class<CompanyRegistrationDetails>(
  "CompanyRegistrationDetails"
)({
  address: CompanyAddress,
  companyName: CompanyName,
  companyPhone: Schema.optional(RedactedCompanyPhone),
  contactFirstName: RedactedPersonName,
  contactLastName: RedactedPersonName,
  email: RedactedEmail,
  vatId: Schema.optional(RedactedVatId),
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
    createdAt: Schema.Date,
    details: CompanyRegistrationDetails,
    id: RegistrationId,
    status: Schema.Literal(RegistrationStatus.literals[0]),
    storeKey: StoreKey,
    updatedAt: Schema.Date,
  }
) {}

export class ApprovalProcessingRegistration extends Schema.TaggedClass<ApprovalProcessingRegistration>()(
  "ApprovalProcessingRegistration",
  {
    createdAt: Schema.Date,
    details: CompanyRegistrationDetails,
    id: RegistrationId,
    requestedDecision: Schema.Literals(["approved", "rejected"]),
    status: Schema.Literal(RegistrationStatus.literals[1]),
    storeKey: StoreKey,
    updatedAt: Schema.Date,
  }
) {}

export class ApprovedRegistration extends Schema.TaggedClass<ApprovedRegistration>()(
  "ApprovedRegistration",
  {
    commerceAccount: CommerceAccount,
    createdAt: Schema.Date,
    decision: ApprovedDecision,
    details: CompanyRegistrationDetails,
    id: RegistrationId,
    invitationId: InvitationId,
    status: Schema.Literal(RegistrationStatus.literals[2]),
    storeKey: StoreKey,
    updatedAt: Schema.Date,
  }
) {}

export class RejectedRegistration extends Schema.TaggedClass<RejectedRegistration>()(
  "RejectedRegistration",
  {
    createdAt: Schema.Date,
    decision: RejectedDecision,
    details: CompanyRegistrationDetails,
    id: RegistrationId,
    status: Schema.Literal(RegistrationStatus.literals[3]),
    storeKey: StoreKey,
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
