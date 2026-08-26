import "server-only";
/* oxlint-disable typescript/no-unsafe-return -- Effect Schema tagged errors are fully typed by tsc; the lint analyzer loses their constructor types across generator yields. */
import { normalizeActionSchemaIssuePath } from "@repo/actions";
import { ErrorIssue } from "@repo/errors";
import { Effect, Redacted, Schema, SchemaGetter, SchemaIssue } from "effect";

import {
  COMPANY_ROLES,
  CompanyRole,
  CompanyRoles,
  CommerceCustomerId,
} from "../domain/commerce-account";
import type { CommerceActionClient } from "../runtime";
import type { CommerceCompanyMemberships } from "../services/commerce-company-memberships";
import type { CommerceContext } from "../services/commerce-context";
import type { CustomerAccountMembers } from "../services/customer-account-members";
import { CustomerAccountCompanyMemberInvitationId } from "../services/customer-account-members";
import type {
  IssueCompanyMemberExpectedFailure,
  ManageCompanyMemberExpectedFailure,
} from "./action-contract";
import {
  CompanyMemberManagementActionError,
  CompanyMemberManagementSuccess,
  InviteCompanyMemberActionError,
  InviteCompanyMemberSuccess,
  projectCompanyMemberInvitationFailure,
  projectCompanyMemberManagementFailure,
} from "./action-contract";
import {
  cancelCompanyMemberInvitation,
  issueCompanyMemberInvitation,
  reissueCompanyMemberInvitation,
  removeCompanyMember,
} from "./programs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const MAX_EMAIL_LENGTH = 320;
const MAX_PERSON_NAME_LENGTH = 100;

interface CompanyRoleSelection {
  admin?: "admin";
  approver?: "approver";
  buyer?: "buyer";
}

const CompanyRoleSelections = Schema.Struct({
  admin: Schema.optional(Schema.Literal("admin")),
  approver: Schema.optional(Schema.Literal("approver")),
  buyer: Schema.optional(Schema.Literal("buyer")),
}).pipe(
  Schema.decodeTo(Schema.Array(CompanyRole), {
    decode: SchemaGetter.transform((selections) =>
      COMPANY_ROLES.filter((role) => selections[role] !== undefined)
    ),
    encode: SchemaGetter.transform((roles) => {
      const selections: CompanyRoleSelection = {};
      if (roles.includes("admin")) {
        selections.admin = "admin";
      }
      if (roles.includes("approver")) {
        selections.approver = "approver";
      }
      if (roles.includes("buyer")) {
        selections.buyer = "buyer";
      }
      return selections;
    }),
  }),
  Schema.decodeTo(CompanyRoles)
);

const InviteCompanyMemberForm = Schema.fromFormData(
  Schema.Struct({
    email: Schema.Trim.pipe(
      Schema.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(MAX_EMAIL_LENGTH),
        Schema.isPattern(EMAIL_PATTERN)
      )
    ),
    firstName: Schema.Trim.pipe(
      Schema.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(MAX_PERSON_NAME_LENGTH)
      )
    ),
    lastName: Schema.Trim.pipe(
      Schema.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(MAX_PERSON_NAME_LENGTH)
      )
    ),
    roles: CompanyRoleSelections,
  })
);

const ManageCompanyMemberInvitationForm = Schema.fromFormData(
  Schema.Struct({
    companyMemberInvitationId: CustomerAccountCompanyMemberInvitationId,
  })
);

const RemoveCompanyMemberForm = Schema.fromFormData(
  Schema.Struct({ customerId: CommerceCustomerId })
);

const invitationIssueMessage = (
  path: "email" | "firstName" | "lastName" | "roles" | "root"
) => {
  if (path === "email") {
    return "Enter a valid email address.";
  }
  if (path === "firstName" || path === "lastName") {
    return "Enter the invited user's first and last name.";
  }
  if (path === "roles") {
    return "Select at least one company role.";
  }
  return "The invitation request is invalid.";
};

const inviteInputIssues = (error: Schema.SchemaError) => {
  const [issue] = SchemaIssue.makeFormatterStandardSchemaV1()(
    error.issue
  ).issues;
  const path = normalizeActionSchemaIssuePath(
    Schema.Literals(["root", "email", "firstName", "lastName", "roles"]),
    issue?.path,
    "root"
  );

  return [
    new ErrorIssue({
      message: invitationIssueMessage(path),
      path: path === "root" ? [] : [path],
    }),
  ];
};

const managementInputIssues = () => [
  new ErrorIssue({
    message: "The company member request is invalid.",
    path: [],
  }),
];

const projectExpectedFailure = (error: IssueCompanyMemberExpectedFailure) =>
  projectCompanyMemberInvitationFailure(error);
const projectManagementFailure = (error: ManageCompanyMemberExpectedFailure) =>
  projectCompanyMemberManagementFailure(error);

export const makeCustomerAccountProcedures = <
  RuntimeServices,
  Context extends { readonly locale: string },
>(
  actions: CommerceActionClient<
    CommerceContext,
    CommerceCompanyMemberships | RuntimeServices | CustomerAccountMembers,
    Context
  >
) => ({
  cancelCompanyMemberInvitationProcedure: actions
    .procedure("CustomerAccount.cancelCompanyMemberInvitation")
    .input(ManageCompanyMemberInvitationForm)
    .output(CompanyMemberManagementSuccess)
    .error(CompanyMemberManagementActionError)
    .mapInputIssues(managementInputIssues)
    .mapError<ManageCompanyMemberExpectedFailure>(projectManagementFailure)
    .handle(({ companyMemberInvitationId }) =>
      cancelCompanyMemberInvitation(companyMemberInvitationId).pipe(
        Effect.as({ operation: "cancel" as const })
      )
    ),
  inviteCompanyMemberProcedure: actions
    .procedure("CustomerAccount.inviteCompanyMember")
    .input(InviteCompanyMemberForm)
    .output(InviteCompanyMemberSuccess)
    .error(InviteCompanyMemberActionError)
    .mapInputIssues(inviteInputIssues)
    .mapError<IssueCompanyMemberExpectedFailure>(projectExpectedFailure)
    .handle((input) =>
      issueCompanyMemberInvitation(input).pipe(
        Effect.map(
          (invitation) =>
            new InviteCompanyMemberSuccess({
              invitationId: invitation.invitationId,
              inviteeEmail: Redacted.value(invitation.inviteeEmail),
            })
        )
      )
    ),
  reissueCompanyMemberInvitationProcedure: actions
    .procedure("CustomerAccount.reissueCompanyMemberInvitation")
    .input(ManageCompanyMemberInvitationForm)
    .output(CompanyMemberManagementSuccess)
    .error(CompanyMemberManagementActionError)
    .mapInputIssues(managementInputIssues)
    .mapError<ManageCompanyMemberExpectedFailure>(projectManagementFailure)
    .handle(({ companyMemberInvitationId }) =>
      reissueCompanyMemberInvitation(companyMemberInvitationId).pipe(
        Effect.as({ operation: "reissue" as const })
      )
    ),
  removeCompanyMemberProcedure: actions
    .procedure("CustomerAccount.removeCompanyMember")
    .input(RemoveCompanyMemberForm)
    .output(CompanyMemberManagementSuccess)
    .error(CompanyMemberManagementActionError)
    .mapInputIssues(managementInputIssues)
    .mapError<ManageCompanyMemberExpectedFailure>(projectManagementFailure)
    .handle(({ customerId }) =>
      removeCompanyMember(customerId).pipe(
        Effect.as({ operation: "remove" as const })
      )
    ),
});
