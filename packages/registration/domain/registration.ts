import { StoreKey } from "@repo/commerce/store";
import { Redacted, Schema } from "effect";

import { ApprovedDecision, RejectedDecision } from "./approval";
import {
  AddressLine,
  AuthUserId,
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

export const RegistrationOnboardingStatus = Schema.Literals([
  "invited",
  "accepted",
  "expired",
  "revoked",
]);
export type RegistrationOnboardingStatus =
  typeof RegistrationOnboardingStatus.Type;

export const RegistrationOnboarding = Schema.Union([
  Schema.Struct({ status: Schema.Literal("invited") }),
  Schema.Struct({
    acceptedAuthUserId: AuthUserId,
    status: Schema.Literal("accepted"),
  }),
  Schema.Struct({ status: Schema.Literal("expired") }),
  Schema.Struct({ status: Schema.Literal("revoked") }),
]);
export type RegistrationOnboarding = typeof RegistrationOnboarding.Type;

export class AwaitingApprovalRegistration extends Schema.TaggedClass<AwaitingApprovalRegistration>()(
  "AwaitingApprovalRegistration",
  {
    createdAt: Schema.Date,
    details: CompanyRegistrationDetails,
    id: RegistrationId,
    status: Schema.Literal(RegistrationStatus.literals[0]),
    storeKey: StoreKey,
    submittedByAuthUserId: Schema.optional(AuthUserId),
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
    submittedByAuthUserId: Schema.optional(AuthUserId),
    updatedAt: Schema.Date,
  }
) {}

export class ApprovedRegistration extends Schema.TaggedClass<ApprovedRegistration>()(
  "ApprovedRegistration",
  Schema.Struct({
    createdAt: Schema.Date,
    decision: ApprovedDecision,
    details: CompanyRegistrationDetails,
    id: RegistrationId,
    invitationId: Schema.optional(InvitationId),
    onboarding: RegistrationOnboarding,
    status: Schema.Literal(RegistrationStatus.literals[2]),
    storeKey: StoreKey,
    submittedByAuthUserId: Schema.optional(AuthUserId),
    updatedAt: Schema.Date,
  }).check(
    Schema.makeFilter(
      (registration) => {
        if (registration.submittedByAuthUserId === undefined) {
          return registration.invitationId !== undefined;
        }

        return (
          registration.invitationId === undefined &&
          registration.onboarding.status === "accepted" &&
          registration.onboarding.acceptedAuthUserId ===
            registration.submittedByAuthUserId
        );
      },
      {
        expected:
          "an invited registration with an invitation id or an accepted verified identity without an invitation",
      }
    )
  )
) {
  get acceptedAuthUserId(): AuthUserId | undefined {
    return this.onboarding.status === "accepted"
      ? this.onboarding.acceptedAuthUserId
      : undefined;
  }

  get onboardingStatus(): RegistrationOnboardingStatus {
    return this.onboarding.status;
  }
}

export class RejectedRegistration extends Schema.TaggedClass<RejectedRegistration>()(
  "RejectedRegistration",
  {
    createdAt: Schema.Date,
    decision: RejectedDecision,
    details: CompanyRegistrationDetails,
    id: RegistrationId,
    status: Schema.Literal(RegistrationStatus.literals[3]),
    storeKey: StoreKey,
    submittedByAuthUserId: Schema.optional(AuthUserId),
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

const normalizedEmail = (email: RedactedEmail) =>
  Redacted.value(email).trim().toLowerCase();

export const registrationBlocksEmail = (
  registration: Registration,
  email: RedactedEmail,
  verifiedAuthUserId?: AuthUserId
) => {
  const belongsToVerifiedIdentity =
    registration._tag === "ApprovedRegistration" &&
    registration.onboarding.status === "accepted" &&
    verifiedAuthUserId !== undefined &&
    registration.onboarding.acceptedAuthUserId === verifiedAuthUserId;
  const belongsToPendingVerifiedIdentity =
    verifiedAuthUserId !== undefined &&
    registration.submittedByAuthUserId === verifiedAuthUserId &&
    (registration.status === "awaiting_approval" ||
      registration.status === "approval_processing");

  return (
    !belongsToVerifiedIdentity &&
    (registration.status === "awaiting_approval" ||
      registration.status === "approval_processing" ||
      (registration._tag === "ApprovedRegistration" &&
        (registration.onboardingStatus === "invited" ||
          registration.onboardingStatus === "accepted"))) &&
    (belongsToPendingVerifiedIdentity ||
      normalizedEmail(registration.details.email) === normalizedEmail(email))
  );
};
