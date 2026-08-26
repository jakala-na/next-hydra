import "server-only";
/* oxlint-disable typescript/no-unsafe-return -- Effect Schema tagged errors are fully typed by tsc; the lint analyzer loses their constructor types across generator yields. */
import { normalizeActionSchemaIssuePath } from "@repo/actions";
import { ErrorIssue } from "@repo/errors";
import { Effect, Redacted, Schema, SchemaGetter, SchemaIssue } from "effect";

import {
  COMPANY_ROLES,
  CompanyRole,
  CompanyRoles,
} from "../domain/commerce-account";
import type { CommerceActionClient } from "../runtime";
import type { CommerceContext } from "../services/commerce-context";
import type { CustomerAccountMembers } from "../services/customer-account-members";
import type { IssueCompanyMemberExpectedFailure } from "./action-contract";
import {
  InviteCompanyMemberActionError,
  InviteCompanyMemberSuccess,
  projectCompanyMemberInvitationFailure,
} from "./action-contract";
import { issueCompanyMemberInvitation } from "./programs";

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

export const makeCustomerAccountProcedures = <
  RuntimeServices,
  Context extends { readonly locale: string },
>(
  actions: CommerceActionClient<
    CommerceContext,
    RuntimeServices | CustomerAccountMembers,
    Context
  >
) => ({
  inviteCompanyMemberProcedure: actions
    .procedure("CustomerAccount.inviteCompanyMember")
    .input(InviteCompanyMemberForm)
    .output(InviteCompanyMemberSuccess)
    .error(InviteCompanyMemberActionError)
    .mapInputIssues(inviteInputIssues)
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action error mapper, not Promise control flow.
    .mapError<IssueCompanyMemberExpectedFailure>((error) =>
      projectCompanyMemberInvitationFailure(error)
    )
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
});
