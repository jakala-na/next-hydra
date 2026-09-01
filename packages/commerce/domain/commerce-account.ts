import { Schema } from "effect";

export const CommerceCustomerId = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceCustomerId")
);
export type CommerceCustomerId = typeof CommerceCustomerId.Type;

export const CommerceBusinessUnitId = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceBusinessUnitId")
);
export type CommerceBusinessUnitId = typeof CommerceBusinessUnitId.Type;

export const CommerceBusinessUnitKey = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceBusinessUnitKey")
);
export type CommerceBusinessUnitKey = typeof CommerceBusinessUnitKey.Type;

export const CommerceBusinessUnitLabel = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceBusinessUnitLabel")
);
export type CommerceBusinessUnitLabel = typeof CommerceBusinessUnitLabel.Type;

export const COMPANY_ROLES = ["admin", "buyer", "approver"] as const;

export const CompanyRole = Schema.Literals(COMPANY_ROLES);
export type CompanyRole = typeof CompanyRole.Type;

export const CompanyRoleList = Schema.Array(CompanyRole).check(
  Schema.isUnique()
);
export type CompanyRoleList = typeof CompanyRoleList.Type;

export const CompanyRoles = Schema.NonEmptyArray(CompanyRole).check(
  Schema.isUnique()
);
export type CompanyRoles = typeof CompanyRoles.Type;

export const INITIAL_COMPANY_ROLES: CompanyRoles = ["admin", "buyer"];

export const hasCompanyRole = (
  roles: readonly CompanyRole[],
  role: CompanyRole
) => roles.includes(role);

export const sameCompanyRoles = (
  left: readonly CompanyRole[],
  right: readonly CompanyRole[]
) => left.length === right.length && left.every((role) => right.includes(role));

export class CommerceBusinessUnitMembership extends Schema.Class<CommerceBusinessUnitMembership>(
  "CommerceBusinessUnitMembership"
)({
  businessUnitId: CommerceBusinessUnitId,
  businessUnitKey: CommerceBusinessUnitKey,
  businessUnitLabel: CommerceBusinessUnitLabel,
  roles: CompanyRoles,
}) {}

export class CommerceAccount extends Schema.Class<CommerceAccount>(
  "CommerceAccount"
)({
  businessUnitId: CommerceBusinessUnitId,
  customerId: CommerceCustomerId,
  registrationId: Schema.String,
}) {}

export class CommerceCustomer extends Schema.Class<CommerceCustomer>(
  "CommerceCustomer"
)({
  authUserId: Schema.String,
  customerId: CommerceCustomerId,
  email: Schema.Redacted(Schema.String, { label: "email" }),
  firstName: Schema.Redacted(Schema.String, { label: "personName" }),
  lastName: Schema.Redacted(Schema.String, { label: "personName" }),
}) {}

export class CommerceCustomerProfile extends Schema.Class<CommerceCustomerProfile>(
  "CommerceCustomerProfile"
)({
  customerId: CommerceCustomerId,
  email: Schema.optional(Schema.Redacted(Schema.String, { label: "email" })),
  firstName: Schema.optional(
    Schema.Redacted(Schema.String, { label: "personName" })
  ),
  lastName: Schema.optional(
    Schema.Redacted(Schema.String, { label: "personName" })
  ),
}) {}

export class CommerceAssociateMembership extends Schema.Class<CommerceAssociateMembership>(
  "CommerceAssociateMembership"
)({
  authUserId: Schema.String,
  businessUnitId: CommerceBusinessUnitId,
  customerId: CommerceCustomerId,
  roles: CompanyRoles,
}) {}

export class CommerceCompanyMember extends Schema.Class<CommerceCompanyMember>(
  "CommerceCompanyMember"
)({
  authUserId: Schema.String,
  businessUnitId: CommerceBusinessUnitId,
  customerId: CommerceCustomerId,
  directlyAssociated: Schema.Boolean,
  email: Schema.Redacted(Schema.String, { label: "email" }),
  firstName: Schema.optional(
    Schema.Redacted(Schema.String, { label: "personName" })
  ),
  lastName: Schema.optional(
    Schema.Redacted(Schema.String, { label: "personName" })
  ),
  inheritedRoles: CompanyRoleList,
  roles: CompanyRoles,
}) {}
