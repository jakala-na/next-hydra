import {
  type CommerceAccountError,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import type { StoreKey } from "@repo/commerce/store";
import { Effect, Schema } from "effect";
import { CountryCode } from "../domain/identity";
import type {
  AwaitingApprovalRegistration,
  CompanyRegistrationDetails,
} from "../domain/registration";
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

export const RegistrationIntakeFieldPath = Schema.Literals(["email", "vatId"]);
export type RegistrationIntakeFieldPath =
  typeof RegistrationIntakeFieldPath.Type;

export class DuplicateRegistrationEmail extends Schema.TaggedClass<DuplicateRegistrationEmail>()(
  "DuplicateRegistrationEmail",
  {
    path: RegistrationIntakeFieldPath,
    code: Schema.Literal("duplicateEmail"),
  }
) {}

export class InvalidRegistrationVatId extends Schema.TaggedClass<InvalidRegistrationVatId>()(
  "InvalidRegistrationVatId",
  {
    path: RegistrationIntakeFieldPath,
    code: Schema.Literal("invalidVatId"),
  }
) {}

export class UnsupportedRegistrationCountry extends Schema.TaggedClass<UnsupportedRegistrationCountry>()(
  "UnsupportedRegistrationCountry",
  {
    code: Schema.Literal("unsupportedRegistrationCountry"),
    country: CountryCode,
  }
) {}

export const RegistrationIntakeValidationReason = Schema.Union([
  DuplicateRegistrationEmail,
  InvalidRegistrationVatId,
  UnsupportedRegistrationCountry,
]);
export type RegistrationIntakeValidationReason =
  typeof RegistrationIntakeValidationReason.Type;

export class RegistrationIntakeValidationError extends Schema.TaggedErrorClass<RegistrationIntakeValidationError>()(
  "RegistrationIntakeValidationError",
  {
    message: Schema.String,
    reasons: Schema.NonEmptyArray(RegistrationIntakeValidationReason),
  }
) {}

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
  RegistrationIntakeValidationError,
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
      hasCustomerWithEmail(details).pipe(Effect.orDie),
      hasIdentityUserWithEmail(details).pipe(Effect.orDie),
      hasPendingRegistrationWithEmail(details).pipe(Effect.orDie),
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
  RegistrationIntakeValidationError | RegistrationCreateError,
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

export type RegistrationEligibilityProviderError =
  | CommerceAccountError
  | IdentityUserLookupFailure
  | RegistrationQueryError;
