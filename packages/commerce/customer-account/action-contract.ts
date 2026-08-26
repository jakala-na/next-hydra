import { makeDisplayActionResultSchema } from "@repo/actions";
import { definePublicError } from "@repo/errors";
import type { InputInvalid } from "@repo/errors";
import { Schema } from "effect";

import type { CommerceRequestContextNotFound } from "../domain/commerce-request-context";
import type {
  CommerceAccountUnavailable,
  CommerceCustomerProfileNotFound,
} from "../services/commerce-accounts";
import type {
  CompanyMemberInvitationNotFound,
  CompanyMemberInvitationPersistenceFailure,
  CompanyMemberInvitationRecordConflict,
  CompanyMemberManagementForbidden,
  CompanyMemberRemovalConflict,
  CustomerAccountProfileIncomplete,
  InvitationConflict,
  InvitationExpired,
  InvitationIssueOutcomeUnknown,
  InvitationNotFound,
  InvitationPolicyError,
  InvitationProviderFailure,
} from "../services/customer-account-members";

const InvitationPolicyErrorDefinition = definePublicError({
  category: "forbidden",
  code: "customerAccount.invitation.forbidden",
  fields: {},
  recovery: "request_access",
  status: 403,
  tag: "InvitationPolicyError",
});

const InvitationConflictDefinition = definePublicError({
  category: "conflict",
  code: "customerAccount.invitation.conflict",
  fields: {},
  recovery: "fix_input",
  status: 409,
  tag: "InvitationConflict",
});

const InvitationProviderFailureDefinition = definePublicError({
  category: "unavailable",
  code: "customerAccount.invitation.unavailable",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "InvitationProviderFailure",
});

const InvitationIssueOutcomeUnknownDefinition = definePublicError({
  category: "unavailable",
  code: "customerAccount.invitation.outcomeUnknown",
  fields: {},
  recovery: "refresh",
  status: 503,
  tag: "InvitationIssueOutcomeUnknown",
});

const CompanyMemberInvitationNotFoundDefinition = definePublicError({
  category: "not_found",
  code: "customerAccount.invitation.notFound",
  fields: {},
  recovery: "refresh",
  status: 404,
  tag: "CompanyMemberInvitationNotFound",
});

const CompanyMemberInvitationPersistenceFailureDefinition = definePublicError({
  category: "unavailable",
  code: "customerAccount.invitation.persistenceUnavailable",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "CompanyMemberInvitationPersistenceFailure",
});

const CompanyMemberInvitationRecordConflictDefinition = definePublicError({
  category: "conflict",
  code: "customerAccount.invitation.stateConflict",
  fields: {},
  recovery: "refresh",
  status: 409,
  tag: "CompanyMemberInvitationRecordConflict",
});

const InvitationExpiredDefinition = definePublicError({
  category: "conflict",
  code: "customerAccount.invitation.expired",
  fields: {},
  recovery: "refresh",
  status: 409,
  tag: "InvitationExpired",
});

const InvitationNotFoundDefinition = definePublicError({
  category: "not_found",
  code: "customerAccount.invitation.providerNotFound",
  fields: {},
  recovery: "refresh",
  status: 404,
  tag: "InvitationNotFound",
});

const CompanyMemberRemovalConflictDefinition = definePublicError({
  category: "conflict",
  code: "customerAccount.member.removalConflict",
  fields: {},
  recovery: "refresh",
  status: 409,
  tag: "CompanyMemberRemovalConflict",
});

const CompanyMemberManagementForbiddenDefinition = definePublicError({
  category: "forbidden",
  code: "customerAccount.member.forbidden",
  fields: {},
  recovery: "request_access",
  status: 403,
  tag: "CompanyMemberManagementForbidden",
});

const CustomerAccountProfileIncompleteDefinition = definePublicError({
  category: "conflict",
  code: "customerAccount.profile.incomplete",
  fields: {},
  recovery: "request_access",
  status: 409,
  tag: "CustomerAccountProfileIncomplete",
});

const CustomerAccountContextUnavailableDefinition = definePublicError({
  category: "not_found",
  code: "customerAccount.contextUnavailable",
  fields: {
    reason: Schema.Literals([
      "noPrincipal",
      "noCustomerMapping",
      "noBuyingContext",
    ]),
  },
  recovery: "refresh",
  status: 404,
  tag: "CommerceRequestContextNotFound",
});

const CustomerAccountProviderFailureDefinition = definePublicError({
  category: "unavailable",
  code: "customerAccount.unavailable",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "CommerceAccountUnavailable",
});

const CustomerProfileNotFoundDefinition = definePublicError({
  category: "not_found",
  code: "customerAccount.profileNotFound",
  fields: {},
  recovery: "request_access",
  status: 404,
  tag: "CommerceCustomerProfileNotFound",
});

export const InviteCompanyMemberActionError = Schema.Union([
  InvitationPolicyErrorDefinition.schema,
  InvitationConflictDefinition.schema,
  InvitationProviderFailureDefinition.schema,
  InvitationIssueOutcomeUnknownDefinition.schema,
  CustomerAccountProfileIncompleteDefinition.schema,
  CustomerAccountContextUnavailableDefinition.schema,
  CustomerAccountProviderFailureDefinition.schema,
  CustomerProfileNotFoundDefinition.schema,
]);
export type InviteCompanyMemberActionError =
  typeof InviteCompanyMemberActionError.Type;

export class InviteCompanyMemberSuccess extends Schema.Class<InviteCompanyMemberSuccess>(
  "InviteCompanyMemberSuccess"
)({
  invitationId: Schema.NonEmptyString,
  inviteeEmail: Schema.NonEmptyString,
}) {}

export const InviteCompanyMemberActionResult = makeDisplayActionResultSchema(
  InviteCompanyMemberSuccess,
  InviteCompanyMemberActionError
);
export type InviteCompanyMemberActionResult =
  typeof InviteCompanyMemberActionResult.Encoded;

export const CompanyMemberManagementActionError = Schema.Union([
  ...InviteCompanyMemberActionError.members,
  CompanyMemberInvitationNotFoundDefinition.schema,
  CompanyMemberInvitationPersistenceFailureDefinition.schema,
  CompanyMemberInvitationRecordConflictDefinition.schema,
  InvitationExpiredDefinition.schema,
  InvitationNotFoundDefinition.schema,
  CompanyMemberRemovalConflictDefinition.schema,
  CompanyMemberManagementForbiddenDefinition.schema,
]);
export type CompanyMemberManagementActionError =
  typeof CompanyMemberManagementActionError.Type;

export const CompanyMemberManagementSuccess = Schema.Struct({
  operation: Schema.Literals(["cancel", "reissue", "remove"]),
});

export const CompanyMemberManagementActionResult =
  makeDisplayActionResultSchema(
    CompanyMemberManagementSuccess,
    CompanyMemberManagementActionError
  );
export type CompanyMemberManagementActionResult =
  typeof CompanyMemberManagementActionResult.Encoded;

export const inviteCompanyMemberFailureMessageKey = (
  error: InputInvalid | CompanyMemberManagementActionError
) => {
  if (error._tag !== "InputInvalid") {
    return error._tag;
  }
  if (error.issues.some((issue) => issue.path[0] === "roles")) {
    return "InputInvalidRoles" as const;
  }
  if (
    error.issues.some(
      (issue) => issue.path[0] === "firstName" || issue.path[0] === "lastName"
    )
  ) {
    return "InputInvalidName" as const;
  }
  return error._tag;
};

export type InviteCompanyMemberAction = (
  previousResult: InviteCompanyMemberActionResult | null,
  formData: FormData
) => Promise<InviteCompanyMemberActionResult>;

export type CompanyMemberManagementAction = (
  previousResult: CompanyMemberManagementActionResult | null,
  formData: FormData
) => Promise<CompanyMemberManagementActionResult>;

export type IssueCompanyMemberExpectedFailure =
  | CommerceAccountUnavailable
  | CommerceCustomerProfileNotFound
  | CommerceRequestContextNotFound
  | CustomerAccountProfileIncomplete
  | InvitationConflict
  | InvitationIssueOutcomeUnknown
  | InvitationPolicyError
  | InvitationProviderFailure;

export type ManageCompanyMemberExpectedFailure =
  | IssueCompanyMemberExpectedFailure
  | CompanyMemberInvitationNotFound
  | CompanyMemberInvitationPersistenceFailure
  | CompanyMemberInvitationRecordConflict
  | CompanyMemberManagementForbidden
  | CompanyMemberRemovalConflict
  | InvitationExpired
  | InvitationNotFound;

export const projectCompanyMemberInvitationFailure = (
  error: IssueCompanyMemberExpectedFailure
): InviteCompanyMemberActionError => {
  switch (error._tag) {
    case "InvitationPolicyError": {
      return InvitationPolicyErrorDefinition.make({
        message: error.message,
      });
    }
    case "InvitationConflict": {
      return InvitationConflictDefinition.make({
        message: error.message,
      });
    }
    case "InvitationProviderFailure": {
      return InvitationProviderFailureDefinition.make({
        message: "The invitation operation could not be completed right now.",
      });
    }
    case "InvitationIssueOutcomeUnknown": {
      return InvitationIssueOutcomeUnknownDefinition.make({
        message:
          "The invitation may have been sent, but its result could not be confirmed.",
      });
    }
    case "CustomerAccountProfileIncomplete": {
      return CustomerAccountProfileIncompleteDefinition.make({
        message: error.message,
      });
    }
    case "CommerceRequestContextNotFound": {
      return CustomerAccountContextUnavailableDefinition.make({
        message: "The current company account is unavailable.",
        reason: error.reason,
      });
    }
    case "CommerceAccountUnavailable": {
      return CustomerAccountProviderFailureDefinition.make({
        message: "The current company account is temporarily unavailable.",
      });
    }
    case "CommerceCustomerProfileNotFound": {
      return CustomerProfileNotFoundDefinition.make({
        message: "The current customer profile could not be found.",
      });
    }
    default: {
      return error satisfies never;
    }
  }
};

export const projectCompanyMemberManagementFailure = (
  error: ManageCompanyMemberExpectedFailure
): CompanyMemberManagementActionError => {
  switch (error._tag) {
    case "CompanyMemberInvitationNotFound": {
      return CompanyMemberInvitationNotFoundDefinition.make({
        message: error.message,
      });
    }
    case "CompanyMemberInvitationPersistenceFailure": {
      return CompanyMemberInvitationPersistenceFailureDefinition.make({
        message: "Company invitations are temporarily unavailable.",
      });
    }
    case "CompanyMemberInvitationRecordConflict": {
      return CompanyMemberInvitationRecordConflictDefinition.make({
        message: error.message,
      });
    }
    case "InvitationExpired": {
      return InvitationExpiredDefinition.make({ message: error.message });
    }
    case "InvitationNotFound": {
      return InvitationNotFoundDefinition.make({ message: error.message });
    }
    case "CompanyMemberRemovalConflict": {
      return CompanyMemberRemovalConflictDefinition.make({
        message: error.message,
      });
    }
    case "CompanyMemberManagementForbidden": {
      return CompanyMemberManagementForbiddenDefinition.make({
        message: error.message,
      });
    }
    case "CommerceAccountUnavailable":
    case "CommerceCustomerProfileNotFound":
    case "CommerceRequestContextNotFound":
    case "CustomerAccountProfileIncomplete":
    case "InvitationConflict":
    case "InvitationIssueOutcomeUnknown":
    case "InvitationPolicyError":
    case "InvitationProviderFailure": {
      return projectCompanyMemberInvitationFailure(error);
    }
    default: {
      return error satisfies never;
    }
  }
};
