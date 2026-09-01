import type { CommerceAccountUnavailable } from "@repo/commerce/services/commerce-accounts";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import type { StoreKey } from "@repo/commerce/store";
import { Effect } from "effect";

import type { AuthUserId } from "../domain/identity";
import type {
  AwaitingApprovalRegistration,
  CompanyRegistrationDetails,
} from "../domain/registration";
import {
  DuplicateRegistrationEmail,
  InvalidRegistrationVatId,
  RegistrationIntakeValidationError,
  UnsupportedRegistrationCountry,
} from "../domain/registration-intake-validation";
import type { RegistrationIntakeValidationReason } from "../domain/registration-intake-validation";
import type { IdentityUserLookupFailure } from "../services/identity-users";
import { IdentityUsers } from "../services/identity-users";
import { RegistrationMarketPolicy } from "../services/registration-market-policy";
import type { RegistrationQueryFailure } from "../services/registration-queries";
import { RegistrationQueries } from "../services/registration-queries";
import type { RegistrationWorkflowStartUnavailable } from "../services/registration-workflow";
import { RegistrationWorkflow } from "../services/registration-workflow";
import type { RegistrationCreateError } from "../services/registrations";
import { Registrations } from "../services/registrations";
import { VatValidator } from "../services/vat-validator";

export type RegistrationEligibilityProviderError =
  | CommerceAccountUnavailable
  | IdentityUserLookupFailure
  | RegistrationQueryFailure;

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
  readonly submittedByAuthUserId?: AuthUserId;
}

const toNonEmptyValidationReasons = (
  reasons: readonly RegistrationIntakeValidationReason[]
):
  | [
      RegistrationIntakeValidationReason,
      ...RegistrationIntakeValidationReason[],
    ]
  | undefined => {
  const [first, ...remaining] = reasons;
  return first === undefined ? undefined : [first, ...remaining];
};

const hasCustomerWithEmail = (details: CompanyRegistrationDetails) =>
  Effect.gen(function* () {
    const commerceAccounts = yield* CommerceAccounts;
    return yield* commerceAccounts.hasCustomerWithEmail(details.email);
  });

const hasCustomerForAuthUserId = (authUserId?: AuthUserId) =>
  authUserId === undefined
    ? Effect.succeed(false)
    : CommerceAccounts.pipe(
        Effect.flatMap((commerceAccounts) =>
          commerceAccounts.getCustomerIdByAuthUserId(authUserId)
        ),
        Effect.as(true),
        Effect.catchTag("CommerceCustomerIdNotFound", () =>
          Effect.succeed(false)
        )
      );

const hasIdentityUserWithEmail = (details: CompanyRegistrationDetails) =>
  Effect.gen(function* () {
    const identityUsers = yield* IdentityUsers;
    return yield* identityUsers.hasUserWithEmail(details.email);
  });

const hasBlockingRegistrationWithEmail = (
  details: CompanyRegistrationDetails,
  submittedByAuthUserId?: AuthUserId
) =>
  Effect.gen(function* () {
    const queries = yield* RegistrationQueries;
    return yield* queries
      .hasBlockingEmail(details.email, submittedByAuthUserId)
      .pipe(Effect.catchTag("RegistrationQueryInvalidCursor", Effect.die));
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
  details: CompanyRegistrationDetails,
  submittedByAuthUserId?: AuthUserId
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
    hasCustomerWithSubmittedEmail,
    hasCustomerForSubmittedIdentity,
    hasIdentityUser,
    hasBlockingEmailRegistration,
    unsupportedRegistrationCountry,
    invalidVatId,
  ] = yield* Effect.all(
    [
      hasCustomerWithEmail(details),
      hasCustomerForAuthUserId(submittedByAuthUserId),
      hasIdentityUserWithEmail(details),
      hasBlockingRegistrationWithEmail(details, submittedByAuthUserId),
      isUnsupportedRegistrationCountry(details),
      isInvalidVatId(details),
    ],
    { concurrency: "unbounded" }
  );
  const validationReasons = toNonEmptyValidationReasons([
    ...(hasCustomerWithSubmittedEmail ||
    hasCustomerForSubmittedIdentity ||
    (hasIdentityUser && submittedByAuthUserId === undefined) ||
    hasBlockingEmailRegistration
      ? [
          new DuplicateRegistrationEmail({
            code: "duplicateEmail",
            path: "email",
          }),
        ]
      : []),
    ...(invalidVatId
      ? [
          new InvalidRegistrationVatId({
            code: "invalidVatId",
            path: "vatId",
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

  return;
});

export const submitRegistrationForReview = Effect.fn(
  "submitRegistrationForReview"
)(function* (
  input: SubmitRegistrationForReviewInput
): Effect.fn.Return<
  AwaitingApprovalRegistration,
  | RegistrationEligibilityProviderError
  | RegistrationIntakeValidationError
  | RegistrationCreateError
  | RegistrationWorkflowStartUnavailable,
  | CommerceAccounts
  | IdentityUsers
  | RegistrationMarketPolicy
  | RegistrationQueries
  | RegistrationWorkflow
  | Registrations
  | VatValidator
> {
  yield* checkRegistrationEligibility(
    input.details,
    input.submittedByAuthUserId
  );
  const registrations = yield* Registrations;
  const workflow = yield* RegistrationWorkflow;
  const registration = yield* registrations.createAwaitingApproval(
    input.submittedByAuthUserId === undefined
      ? {
          details: input.details,
          storeKey: input.storeKey,
        }
      : {
          details: input.details,
          storeKey: input.storeKey,
          submittedByAuthUserId: input.submittedByAuthUserId,
        }
  );

  return yield* workflow.start(registration.id).pipe(
    Effect.as(registration),
    Effect.onError(() =>
      registrations.discardAwaitingApproval(registration.id).pipe(Effect.orDie)
    )
  );
});
