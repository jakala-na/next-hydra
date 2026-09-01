import {
  ErrorIssue,
  InputInvalid,
  definePublicError,
  makeInputInvalid,
} from "@repo/errors";
import { registrationFormMessageCatalogs } from "@repo/i18n/registration-messages";
import type { Locale } from "@repo/i18n/types";
import { Schema } from "effect";

import { InvitationId, RegistrationId } from "./domain/identity";
import { RegistrationOnboardingStatus } from "./domain/registration";
import { RegistrationIntakeValidationReason } from "./domain/registration-intake-validation";
import type { RegistrationIntakeValidationError } from "./domain/registration-intake-validation";

const isLocale = (locale: string): locale is Locale =>
  Object.hasOwn(registrationFormMessageCatalogs, locale);

const registrationMessages = (locale: string) =>
  registrationFormMessageCatalogs[isLocale(locale) ? locale : "en-US"];

const absurd = (error: never): never => {
  throw new Error(`Unexpected registration failure: ${String(error)}`);
};

export const RegistrationApiErrorFailure = definePublicError({
  category: "unavailable",
  code: "registration.unavailable",
  fields: {
    retryAfterSeconds: Schema.optional(Schema.Number),
  },
  recovery: "retry",
  status: 503,
  tag: "RegistrationApiError",
});
export const RegistrationApiError = RegistrationApiErrorFailure.schema;
export type RegistrationApiError = typeof RegistrationApiError.Type;

export const PublicRegistrationQueryInvalidCursorFailure = definePublicError({
  category: "bad_input",
  code: "registration.invalidCursor",
  fields: {},
  recovery: "fix_input",
  status: 400,
  tag: "RegistrationQueryInvalidCursor",
});
export const PublicRegistrationQueryInvalidCursor =
  PublicRegistrationQueryInvalidCursorFailure.schema;
export type PublicRegistrationQueryInvalidCursor =
  typeof PublicRegistrationQueryInvalidCursor.Type;

export const PublicRegistrationConcurrentModificationFailure =
  definePublicError({
    category: "conflict",
    code: "registration.conflict",
    fields: {},
    recovery: "refresh",
    status: 409,
    tag: "RegistrationConcurrentModification",
  });
export const PublicRegistrationConcurrentModification =
  PublicRegistrationConcurrentModificationFailure.schema;
export type PublicRegistrationConcurrentModification =
  typeof PublicRegistrationConcurrentModification.Type;

export const RegistrationTransitionConflictFailure = definePublicError({
  category: "conflict",
  code: "registration.conflict",
  fields: {},
  recovery: "refresh",
  status: 409,
  tag: "RegistrationTransitionConflict",
});
export const PublicRegistrationTransitionConflict =
  RegistrationTransitionConflictFailure.schema;
export type PublicRegistrationTransitionConflict =
  typeof PublicRegistrationTransitionConflict.Type;

export const PublicRegistrationOnboardingTransitionConflictFailure =
  definePublicError({
    category: "conflict",
    code: "registration.onboardingConflict",
    fields: {
      attemptedStatus: RegistrationOnboardingStatus,
      currentState: Schema.String,
      registrationId: RegistrationId,
    },
    recovery: "refresh",
    status: 409,
    tag: "RegistrationOnboardingTransitionConflict",
  });
export const PublicRegistrationOnboardingTransitionConflict =
  PublicRegistrationOnboardingTransitionConflictFailure.schema;
export type PublicRegistrationOnboardingTransitionConflict =
  typeof PublicRegistrationOnboardingTransitionConflict.Type;

export const PublicInvitationConflictFailure = definePublicError({
  category: "conflict",
  code: "registration.invitationConflict",
  fields: {},
  recovery: "refresh",
  status: 409,
  tag: "InvitationConflict",
});
export const PublicInvitationConflict = PublicInvitationConflictFailure.schema;
export type PublicInvitationConflict = typeof PublicInvitationConflict.Type;

export const PublicInvitationExpiredFailure = definePublicError({
  category: "conflict",
  code: "registration.invitationExpired",
  fields: {
    expiredAt: Schema.String,
    invitationId: InvitationId,
  },
  recovery: "none",
  status: 409,
  tag: "InvitationExpired",
});
export const PublicInvitationExpired = PublicInvitationExpiredFailure.schema;
export type PublicInvitationExpired = typeof PublicInvitationExpired.Type;

export const PublicInvitationNotFoundFailure = definePublicError({
  category: "not_found",
  code: "registration.invitationNotFound",
  fields: {
    invitationId: InvitationId,
  },
  recovery: "refresh",
  status: 404,
  tag: "InvitationNotFound",
});
export const PublicInvitationNotFound = PublicInvitationNotFoundFailure.schema;
export type PublicInvitationNotFound = typeof PublicInvitationNotFound.Type;

export const RegistrationAlreadyApprovedFailure = definePublicError({
  category: "conflict",
  code: "registration.alreadyApproved",
  fields: {},
  recovery: "refresh",
  status: 409,
  tag: "RegistrationAlreadyApproved",
});
export const RegistrationAlreadyApproved =
  RegistrationAlreadyApprovedFailure.schema;
export type RegistrationAlreadyApproved =
  typeof RegistrationAlreadyApproved.Type;

export const RegistrationAlreadyRejectedFailure = definePublicError({
  category: "conflict",
  code: "registration.alreadyRejected",
  fields: {},
  recovery: "refresh",
  status: 409,
  tag: "RegistrationAlreadyRejected",
});
export const RegistrationAlreadyRejected =
  RegistrationAlreadyRejectedFailure.schema;
export type RegistrationAlreadyRejected =
  typeof RegistrationAlreadyRejected.Type;

export const RegistrationDecisionAlreadyProcessingFailure = definePublicError({
  category: "conflict",
  code: "registration.decisionAlreadyProcessing",
  fields: {},
  recovery: "refresh",
  status: 409,
  tag: "RegistrationDecisionAlreadyProcessing",
});
export const RegistrationDecisionAlreadyProcessing =
  RegistrationDecisionAlreadyProcessingFailure.schema;
export type RegistrationDecisionAlreadyProcessing =
  typeof RegistrationDecisionAlreadyProcessing.Type;

export const PublicRegistrationNotFoundFailure = definePublicError({
  category: "not_found",
  code: "registration.notFound",
  fields: {},
  recovery: "refresh",
  status: 404,
  tag: "RegistrationNotFound",
});
export const PublicRegistrationNotFound =
  PublicRegistrationNotFoundFailure.schema;
export type PublicRegistrationNotFound = typeof PublicRegistrationNotFound.Type;

export const RegistrationApiUnauthorizedFailure = definePublicError({
  category: "unauthenticated",
  code: "registration.unauthenticated",
  fields: {},
  recovery: "reauthenticate",
  status: 401,
  tag: "RegistrationApiUnauthorized",
});
export const RegistrationApiUnauthorized =
  RegistrationApiUnauthorizedFailure.schema;
export type RegistrationApiUnauthorized =
  typeof RegistrationApiUnauthorized.Type;

export const RegistrationApiForbiddenFailure = definePublicError({
  category: "forbidden",
  code: "registration.forbidden",
  fields: {},
  recovery: "request_access",
  status: 403,
  tag: "RegistrationApiForbidden",
});
export const RegistrationApiForbidden = RegistrationApiForbiddenFailure.schema;
export type RegistrationApiForbidden = typeof RegistrationApiForbidden.Type;

export const RegistrationApiAuthenticationUnavailableFailure =
  definePublicError({
    category: "unavailable",
    code: "registration.authenticationUnavailable",
    fields: {},
    recovery: "retry",
    status: 503,
    tag: "RegistrationApiAuthenticationUnavailable",
  });
export const RegistrationApiAuthenticationUnavailable =
  RegistrationApiAuthenticationUnavailableFailure.schema;
export type RegistrationApiAuthenticationUnavailable =
  typeof RegistrationApiAuthenticationUnavailable.Type;

export const RegistrationDecisionOutcomeUnknownFailure = definePublicError({
  category: "unavailable",
  code: "registration.decisionOutcomeUnknown",
  fields: {
    registrationId: RegistrationId,
  },
  recovery: "refresh",
  status: 503,
  tag: "RegistrationDecisionOutcomeUnknown",
});
export const RegistrationDecisionOutcomeUnknown =
  RegistrationDecisionOutcomeUnknownFailure.schema;
export type RegistrationDecisionOutcomeUnknown =
  typeof RegistrationDecisionOutcomeUnknown.Type;

export const PublicRegistrationWorkflowInvitationResumeOutcomeUnknownFailure =
  definePublicError({
    category: "unavailable",
    code: "registration.invitationResumeOutcomeUnknown",
    fields: {
      invitationId: InvitationId,
    },
    recovery: "refresh",
    status: 503,
    tag: "RegistrationWorkflowInvitationResumeOutcomeUnknown",
  });
export const PublicRegistrationWorkflowInvitationResumeOutcomeUnknown =
  PublicRegistrationWorkflowInvitationResumeOutcomeUnknownFailure.schema;
export type PublicRegistrationWorkflowInvitationResumeOutcomeUnknown =
  typeof PublicRegistrationWorkflowInvitationResumeOutcomeUnknown.Type;

export const RegistrationSubmissionOutcomeUnknownFailure = definePublicError({
  category: "unavailable",
  code: "registration.submissionOutcomeUnknown",
  fields: {},
  recovery: "none",
  status: 503,
  tag: "RegistrationSubmissionOutcomeUnknown",
});
export const RegistrationSubmissionOutcomeUnknown =
  RegistrationSubmissionOutcomeUnknownFailure.schema;
export type RegistrationSubmissionOutcomeUnknown =
  typeof RegistrationSubmissionOutcomeUnknown.Type;

export const RegistrationApiValidationErrorFailure = definePublicError({
  category: "bad_input",
  code: "registration.invalidInput",
  fields: {
    issues: Schema.NonEmptyArray(ErrorIssue),
    reasons: Schema.NonEmptyArray(RegistrationIntakeValidationReason),
  },
  recovery: "fix_input",
  status: 422,
  tag: "RegistrationApiValidationError",
});
export const RegistrationApiValidationError =
  RegistrationApiValidationErrorFailure.schema;
export type RegistrationApiValidationError =
  typeof RegistrationApiValidationError.Type;

export const RegistrationCreatePublicError = Schema.Union([
  InputInvalid,
  RegistrationApiError,
  RegistrationApiValidationError,
]);
export type RegistrationCreatePublicError =
  typeof RegistrationCreatePublicError.Type;

/** Public action contract after its local input schema has succeeded. */
export const RegistrationSubmissionPublicError = Schema.Union([
  RegistrationApiError,
  RegistrationApiValidationError,
  RegistrationSubmissionOutcomeUnknown,
]);
export type RegistrationSubmissionPublicError =
  typeof RegistrationSubmissionPublicError.Type;

export const RegistrationDecisionPublicError = Schema.Union([
  RegistrationApiError,
  RegistrationAlreadyApproved,
  RegistrationAlreadyRejected,
  PublicRegistrationConcurrentModification,
  PublicRegistrationTransitionConflict,
  RegistrationDecisionAlreadyProcessing,
  PublicRegistrationNotFound,
  RegistrationApiUnauthorized,
  RegistrationApiForbidden,
  RegistrationApiAuthenticationUnavailable,
  RegistrationDecisionOutcomeUnknown,
]);
export type RegistrationDecisionPublicError =
  typeof RegistrationDecisionPublicError.Type;

export const RegistrationInvitationRevocationPublicError = Schema.Union([
  RegistrationApiError,
  RegistrationApiUnauthorized,
  RegistrationApiForbidden,
  RegistrationApiAuthenticationUnavailable,
  PublicInvitationConflict,
  PublicInvitationExpired,
  PublicInvitationNotFound,
  PublicRegistrationConcurrentModification,
  PublicRegistrationNotFound,
  PublicRegistrationOnboardingTransitionConflict,
  PublicRegistrationWorkflowInvitationResumeOutcomeUnknown,
]);
export type RegistrationInvitationRevocationPublicError =
  typeof RegistrationInvitationRevocationPublicError.Type;

export const registrationUnavailable = (
  locale = "en-US",
  retryAfterSeconds?: number
) =>
  RegistrationApiErrorFailure.make({
    message: registrationMessages(locale).errors.submitFailed,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });

export const registrationSubmissionOutcomeUnknown = (locale = "en-US") =>
  RegistrationSubmissionOutcomeUnknownFailure.make({
    message: registrationMessages(locale).errors.submissionOutcomeUnknown,
  });

export const registrationBadRequest = (
  message: string,
  issues?: readonly [ErrorIssue, ...ErrorIssue[]]
) =>
  makeInputInvalid({
    issues: issues ?? [new ErrorIssue({ message, path: [] })],
    message,
  });

export const registrationDecisionOutcomeUnknown = (
  registrationId: RegistrationId
) =>
  RegistrationDecisionOutcomeUnknownFailure.make({
    message:
      "The decision was received, but processing could not be confirmed. Refresh before taking further action.",
    registrationId,
  });

export const registrationUnauthorized = () =>
  RegistrationApiUnauthorizedFailure.make({
    message: "Authentication is required.",
  });

export const registrationForbidden = () =>
  RegistrationApiForbiddenFailure.make({
    message: "Registration administration access is denied.",
  });

export const registrationAuthenticationUnavailable = () =>
  RegistrationApiAuthenticationUnavailableFailure.make({
    message: "Registration authentication is temporarily unavailable.",
  });

export const projectRegistrationIntakeValidation = (
  error: RegistrationIntakeValidationError,
  locale: string
): RegistrationApiValidationError => {
  const messages = registrationMessages(locale);
  const toIssue = (
    reason: RegistrationIntakeValidationError["reasons"][number]
  ) => {
    switch (reason._tag) {
      case "DuplicateRegistrationEmail": {
        return new ErrorIssue({
          message: messages.validation.duplicateEmail,
          path: [reason.path],
        });
      }
      case "InvalidRegistrationVatId": {
        return new ErrorIssue({
          message: messages.validation.invalidVatId,
          path: [reason.path],
        });
      }
      case "UnsupportedRegistrationCountry": {
        return new ErrorIssue({
          message: messages.errors.unsupportedRegistrationCountry,
          path: [],
        });
      }
      default: {
        return absurd(reason);
      }
    }
  };
  const [first, ...remaining] = error.reasons;

  return RegistrationApiValidationErrorFailure.make({
    issues: [toIssue(first), ...remaining.map(toIssue)],
    message: messages.errors.invalidSubmission,
    reasons: error.reasons,
  });
};
