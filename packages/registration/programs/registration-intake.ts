import {
  type CommerceAccountError,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import type { StoreKey } from "@repo/commerce/store";
import { Effect } from "effect";

import type {
  AwaitingApprovalRegistration,
  CompanyRegistrationDetails,
} from "../domain/registration";
import {
  DuplicateRegistrationEmail,
  InvalidRegistrationVatId,
  RegistrationIntakeValidationError,
  type RegistrationIntakeValidationReason,
  UnsupportedRegistrationCountry,
} from "../domain/registration-intake-validation";
import type { IdentityUserLookupFailure } from "../services/identity-users";
import { IdentityUsers } from "../services/identity-users";
import { RegistrationMarketPolicy } from "../services/registration-market-policy";
import type { RegistrationQueryError } from "../services/registration-queries";
import { RegistrationQueries } from "../services/registration-queries";
import {
  type RegistrationCreateError,
  Registrations,
} from "../services/registrations";
import { VatValidator } from "../services/vat-validator";

export type RegistrationEligibilityProviderError =
  | CommerceAccountError
  | IdentityUserLookupFailure
  | RegistrationQueryError;

export {
  DuplicateRegistrationEmail,
  InvalidRegistrationVatId,
  RegistrationIntakeFieldPath,
  RegistrationIntakeValidationError,
  RegistrationIntakeValidationReason,
  UnsupportedRegistrationCountry,
} from "../domain/registration-intake-validation";

export interface SubmitRegistrationForReviewInput {
  readonly details: CompanyRegistrationDetails;
  readonly storeKey: StoreKey;
}

const toNonEmptyValidationReasons = (
  reasons: readonly RegistrationIntakeValidationReason[]
) =>
  reasons.length > 0
    ? ([reasons[0], ...reasons.slice(1)] as [
        RegistrationIntakeValidationReason,
        ...RegistrationIntakeValidationReason[],
      ])
    : undefined;

const hasCustomerWithEmail = (details: CompanyRegistrationDetails) =>
  Effect.gen(function* () {
    const commerceAccounts = yield* CommerceAccounts;
    return yield* commerceAccounts.hasCustomerWithEmail(details.email);
  });

const hasIdentityUserWithEmail = (details: CompanyRegistrationDetails) =>
  Effect.gen(function* () {
    const identityUsers = yield* IdentityUsers;
    return yield* identityUsers.hasUserWithEmail(details.email);
  });

const hasPendingRegistrationWithEmail = (details: CompanyRegistrationDetails) =>
  Effect.gen(function* () {
    const queries = yield* RegistrationQueries;
    return yield* queries.hasPendingEmail(details.email);
  });

const isUnsupportedRegistrationCountry = (
  details: CompanyRegistrationDetails
) =>
  Effect.gen(function* () {
    const marketPolicy = yield* RegistrationMarketPolicy;
    return yield* marketPolicy
      .canRegisterCompany(details.address.country)
      .pipe(Effect.map((supported) => !supported));
  });

const isInvalidVatId = (details: CompanyRegistrationDetails) =>
  Effect.gen(function* () {
    if (!details.vatId) {
      return false;
    }

    const vatValidator = yield* VatValidator;
    return yield* vatValidator
      .isValid(details.vatId)
      .pipe(Effect.map((valid) => !valid));
  });

export const checkRegistrationEligibility = Effect.fn(
  "checkRegistrationEligibility"
)(function* (
  details: CompanyRegistrationDetails
): Effect.fn.Return<
  void,
  RegistrationEligibilityProviderError | RegistrationIntakeValidationError,
  | CommerceAccounts
  | IdentityUsers
  | RegistrationMarketPolicy
  | RegistrationQueries
  | VatValidator
> {
  const [
    hasCustomer,
    hasIdentityUser,
    hasPendingEmailRegistration,
    unsupportedRegistrationCountry,
    invalidVatId,
  ] = yield* Effect.all(
    [
      hasCustomerWithEmail(details),
      hasIdentityUserWithEmail(details),
      hasPendingRegistrationWithEmail(details),
      isUnsupportedRegistrationCountry(details),
      isInvalidVatId(details),
    ],
    { concurrency: "unbounded" }
  );
  const validationReasons = toNonEmptyValidationReasons([
    ...(hasCustomer || hasIdentityUser || hasPendingEmailRegistration
      ? [
          new DuplicateRegistrationEmail({
            path: "email",
            code: "duplicateEmail",
          }),
        ]
      : []),
    ...(invalidVatId
      ? [
          new InvalidRegistrationVatId({
            path: "vatId",
            code: "invalidVatId",
          }),
        ]
      : []),
    ...(unsupportedRegistrationCountry
      ? [
          new UnsupportedRegistrationCountry({
            code: "unsupportedRegistrationCountry",
            country: details.address.country,
          }),
        ]
      : []),
  ]);

  if (validationReasons) {
    return yield* new RegistrationIntakeValidationError({
      message: "Registration has field validation errors",
      reasons: validationReasons,
    });
  }
});

export const submitRegistrationForReview = Effect.fn(
  "submitRegistrationForReview"
)(function* (
  input: SubmitRegistrationForReviewInput
): Effect.fn.Return<
  AwaitingApprovalRegistration,
  | RegistrationEligibilityProviderError
  | RegistrationIntakeValidationError
  | RegistrationCreateError,
  | CommerceAccounts
  | IdentityUsers
  | RegistrationMarketPolicy
  | RegistrationQueries
  | Registrations
  | VatValidator
> {
  yield* checkRegistrationEligibility(input.details);
  const registrations = yield* Registrations;
  return yield* registrations.createAwaitingApproval({
    details: input.details,
    storeKey: input.storeKey,
  });
});
